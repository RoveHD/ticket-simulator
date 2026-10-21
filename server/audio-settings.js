'use strict';
const DEFAULT_AUDIO = Object.freeze({ muted: false, musicEnabled: true, effectsEnabled: true, musicVolume: .22, effectsVolume: .45, musicTrack: 'funk' });
function validAudio(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => Object.hasOwn(DEFAULT_AUDIO,key)) &&
    (value.musicTrack === undefined || ['funk','battle'].includes(value.musicTrack)) &&
    ['muted', 'musicEnabled', 'effectsEnabled'].every(key => typeof value[key] === 'boolean') &&
    ['musicVolume', 'effectsVolume'].every(key => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1);
}
module.exports = { DEFAULT_AUDIO, validAudio };
