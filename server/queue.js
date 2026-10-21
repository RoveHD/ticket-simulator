'use strict';

const SLA = { P1: 30, P2: 60, P3: 120, P4: 240 };

function validateQueue(result, previous, session) {
  // Old saved sessions have no structured queue. Their next AI turn supplies it.
  if (result.queue === undefined) return;
  const invalid = () => { throw Object.assign(new Error('Die Ticketliste war unvollständig oder widersprüchlich. Der Spielstand bleibt erhalten.'), { status: 502 }); };
  const clock = result.elapsed + result.waiting;
  const arrived = session.plan.filter(item => item.minute <= clock);
  if (!Array.isArray(result.queue) || result.queue.length !== arrived.length) invalid();
  for (let i = 0; i < arrived.length; i++) {
    const item = result.queue[i], planned = arrived[i];
    if (!item || item.number !== planned.number || !['title', 'requester', 'department'].every(key => typeof item[key] === 'string' && item[key].trim() && item[key].length <= 500) ||
      !['open', 'solved', 'abandoned'].includes(item.status)) invalid();
    if (item.status === 'open' ? item.closedAt !== null : !Number.isFinite(item.closedAt) || item.closedAt < planned.minute || item.closedAt > clock) invalid();
    const before = previous?.queue?.find(old => old.number === item.number);
    if (before && before.status !== 'open' && (item.status !== before.status || item.closedAt !== before.closedAt)) invalid();
  }
  if (result.status === 'completed' && result.summary &&
    (result.summary.arrived !== arrived.length || result.summary.solvedCount !== result.queue.filter(item => item.status === 'solved').length)) invalid();
}

function publicQueue(session) {
  if (!session) return [];
  const current = session.current, clock = current.elapsed + current.waiting;
  return session.plan.filter(item => item.minute <= clock).map(planned => {
    const item = current.queue?.find(entry => entry.number === planned.number);
    const active = current.hidden.active === planned.number;
    const age = Math.max(0, (item?.closedAt ?? clock) - planned.minute);
    return { number: planned.number, title: item?.title || (active ? current.ticket.title : 'Meldung beim nächsten Zug verfügbar'),
      requester: item?.requester || 'Noch nicht erfasst', department: item?.department || 'Unbekannt',
      status: item?.status || 'unknown', priority: planned.priority, arrivalMinute: planned.minute, age,
      sla: SLA[planned.priority], remaining: SLA[planned.priority] - age, active };
  });
}

function canWaitForArrival(session) {
  return Boolean(session?.mode === 'speedrun' && session.current?.status === 'active' &&
    session.current.elapsed + session.current.waiting < session.duration &&
    !publicQueue(session).some(item => item.status === 'open' || item.status === 'unknown'));
}

function waitStep(session, message) {
  if (typeof message !== 'string' || !/^(?:bis zur nächsten meldung warten|warten|auf (?:das )?nächste(?:s)? ticket warten|auf (?:die )?nächste meldung warten)[.!]?$/i.test(message.trim())) return null;
  if (!canWaitForArrival(session)) {
    throw Object.assign(new Error('Warten auf die nächste Meldung ist nur in einer laufenden Speedrun-Schicht ohne offene Tickets möglich.'), { status: 400 });
  }
  const previous = session.current, before = previous.elapsed + previous.waiting;
  const clock = session.plan.reduce((next, item) => item.minute > before ? Math.min(next, item.minute) : next, session.duration);
  const arriving = session.plan.find(item => item.minute > before && item.minute === clock);
  return { elapsed: previous.elapsed, waiting: clock - previous.elapsed, clock,
    activeNumber: arriving?.number || previous.hidden.active };
}

function validateWaitResult(result, previous, session, step) {
  const invalid = () => { throw Object.assign(new Error('Das Warten wurde widersprüchlich simuliert. Der Spielstand bleibt erhalten.'), { status: 502 }); };
  if (result.elapsed !== step.elapsed || result.waiting !== step.waiting || result.hidden.active !== step.activeNumber ||
    result.status !== (step.clock === session.duration ? 'completed' : 'active')) invalid();
  const beforeClock = previous.elapsed + previous.waiting;
  for (const item of result.queue) {
    const before = previous.queue?.find(old => old.number === item.number);
    if (before) {
      if (['number', 'title', 'requester', 'department', 'status', 'closedAt'].some(key => before[key] !== item[key])) invalid();
    } else if (item.status !== 'open' || item.closedAt !== null) invalid();
  }
  for (const ticket of result.hidden.tickets) {
    const planned = session.plan.find(item => item.number === ticket.number);
    if ((planned.minute <= beforeClock || planned.minute > step.clock) &&
      ticket.state !== previous.hidden.tickets.find(item => item.number === ticket.number).state) invalid();
  }
  if (step.activeNumber !== previous.hidden.active) {
    const entry = result.queue.find(item => item.number === step.activeNumber);
    if (!entry || entry.status !== 'open' || !result.ticket.title.trim() || !result.ticket.description.trim()) invalid();
  }
  if (result.status === 'completed' && result.summary.solved !== result.queue.some(item => item.status === 'solved')) invalid();
}

module.exports = { validateQueue, publicQueue, canWaitForArrival, waitStep, validateWaitResult };
