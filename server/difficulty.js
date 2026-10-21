'use strict';

const { HARDWARE_SCENARIOS } = require('./hardware-training');

const PROFILES = [
  { level: 1, title: 'IT-Support', summary: 'Ein klar abgegrenzter Arbeitsplatzfall mit wenigen, sichtbaren Symptomen.', scope: 'Ein Gerät, ein Benutzer, grundlegende Bedienung und Peripherie.', challenge: 'Symptome sauber aufnehmen und einfache Prüfungen in sinnvoller Reihenfolge durchführen.' },
  { level: 2, title: 'Fortgeschrittener IT-Support', summary: 'Standarddienste oder mehrere Anwender sind betroffen; Umfang und Gemeinsamkeiten müssen erkannt werden.', scope: 'Kleine Benutzergruppen, Standarddienste und typische Windows-/M365-Arbeitsabläufe.', challenge: 'Einzelplatzfehler von einem gemeinsamen Dienst- oder Konfigurationsproblem unterscheiden.' },
  { level: 3, title: 'Junior-Systemadministrator', summary: 'Ein administrativer Fehler erfordert systematische Diagnose über Client und Basisdienste.', scope: 'AD, DNS, DHCP, GPO, Dateidienste und grundlegende Serverdiagnose.', challenge: 'Beobachtungen verifizieren, Abhängigkeiten nachvollziehen und Änderungen gezielt prüfen.' },
  { level: 4, title: 'Systemadministrator', summary: 'Ein Fehler in einer Dienstkette betrifft mehrere Komponenten und verlangt gezielte Eingrenzung.', scope: 'Windows- und Linux-Server, systemd, Dateirechte, Virtualisierung, Backup, Zertifikate und Netzwerkpfade.', challenge: 'Fehlergrenzen und Abhängigkeiten bestimmen; Wiederherstellung ohne unnötige Ausfälle absichern.' },
  { level: 5, title: 'Senior-Systemadministrator', summary: 'Ein standortübergreifender oder hybrider Fall verbindet mehrere Betriebsbereiche.', scope: 'Mehrere Standorte, Linux-Dienste, PAM/SSSD, Container-Netze, hybride Identitäten, WAN/VPN und zentrale Infrastruktur.', challenge: 'Logs, Berechtigungen, Namensauflösung und unterschiedliche Zugriffspfade korrelieren; einen sicheren Änderungs- und Rückfallplan begründen.' },
  { level: 6, title: 'Infrastruktur-Experte', summary: 'Ein kritischer, systemübergreifender Fehler hat eine schwer erkennbare, aber einzelne Hauptursache.', scope: 'Kritische Windows-/Linux-Infrastrukturketten: HA-Cluster, Quorum/Fencing, PKI, Policy-Routing, Storage und Wiederanlauf.', challenge: 'Mehrere unabhängige Belege zu einer zentralen Fehlerdomäne verbinden, Risiken bewerten und Ende-zu-Ende kontrolliert wiederherstellen.' },
];

// Authoring constraints, not hints displayed in an active incident.
const COMPLEXITY = [
  'Ein Anwender, ein Gerät, eine lokale Fehlerdomäne. Direkte verständliche Symptome. Mit 1–2 gezielten Prüfungen eingrenzbar; reversible Standardmaßnahme. Keine versteckte Server-, Replikations- oder Routingkette. Typische Referenz 4–8 Minuten.',
  'Eine kleine Gruppe und ein gemeinsam genutzter Dienst. Mindestens Client und gemeinsame Ressource unterscheiden; 2–3 fachlich begründete Prüfungen. Standardmaßnahmen und einfache Rechteprüfung. Typische Referenz 8–15 Minuten.',
  'Mindestens zwei beteiligte Komponenten und zwei anfangs plausible Hypothesen. Ursache durch korrelierte Befunde eingrenzen; ein bloßer Neustart löst sie nicht dauerhaft, sofern er die festgelegte Ursache nicht tatsächlich beseitigt. Typische Referenz 12–25 Minuten.',
  'Mindestens drei voneinander abhängige Komponenten. Ein Teilerfolg (z. B. TCP erreichbar) reicht nicht als Dienstnachweis. Logs und Konfiguration müssen gemeinsam ausgewertet werden; Änderung mit sinnvoller Rückfallmöglichkeit und Prüfung der abhängigen Dienste. Bei Linux-Fällen distributions- und dienstplausible systemctl-/journalctl-Ausgaben sowie relevante Datei-, Prozess- und Rechtezustände simulieren. Typische Referenz 20–35 Minuten.',
  'Mindestens vier Komponenten über mindestens zwei Betriebsbereiche oder Standorte. Ein technisch erklärbares asymmetrisches oder intermittierendes Fehlerbild und mehrere plausible Hypothesen. Zeitstempel, Replikationszustände oder unterschiedliche Zugriffspfade sind zur Eingrenzung relevant. Linux-Fälle verlangen die Unterscheidung von Dienstzustand, Namensauflösung, Berechtigungen und Sicherheitsrichtlinien anhand plausibler Logs; ein pauschales Abschalten von Sicherheitsmechanismen darf keine risikofreie Universallösung sein. Belegter Änderungsplan, Folgenabschätzung und Rückfallweg nötig. Typische Referenz 30–50 Minuten.',
  'Mindestens vier eng gekoppelte Komponenten über drei technische Ebenen (z. B. Netzwerk, Identität, Plattform). Eine einzelne tief liegende Hauptursache erzeugt mehrere unterschiedliche Symptome; Einzeltests sind nicht beweiskräftig. Mindestens drei zunächst plausible Hypothesen müssen mit tatsächlich zugänglichen Befunden unterscheidbar sein. Eine naheliegende pauschale Änderung kann nach vorab festgelegten Folgen produktive Dienste zusätzlich gefährden. Linux-Fälle dürfen HA-Quorum/Fencing, systemd-Abhängigkeiten, nftables/Policy-Routing, LVM/multipath oder PKI-Vertrauensketten einbeziehen; verwendete Werkzeuge und Ausgaben müssen zur im Voraus festgelegten Distribution und Plattform passen. Erfordert Korrelation mehrerer unabhängiger Belege, eine sichere Reihenfolge der Wiederherstellung, Rückfallplan und Ende-zu-Ende-Prüfung. Kein einzelner magischer Befehl, keine künstlich zurückgehaltenen Befunde. Typische Referenz 40–60 Minuten.',
];

// Briefings describe a family of plausible cases, never the ticket's fixed cause.
const SCENARIOS = [
  ['workstation-peripheral',1,'Arbeitsplatz / Peripherie','Ein einzelner Arbeitsplatz kann ein angeschlossenes Gerät nicht wie gewohnt verwenden.'],
  ['workstation-profile',1,'Windows-Arbeitsplatz','Bei einer Person verhält sich eine lokale Windows-Funktion seit kurzem anders.'],
  ['workstation-print',1,'Drucken','Ein Benutzer kann an seinem Arbeitsplatz einen Druckauftrag nicht zuverlässig ausgeben.'],
  ['workstation-audio',1,'Arbeitsplatz / Audio','Bei einem einzelnen Arbeitsplatz gibt es ein Problem mit Audio oder Konferenzzubehör.'],
  ['workstation-display',1,'Arbeitsplatz / Anzeige','Ein einzelner Arbeitsplatz zeigt Inhalte nach einer Änderung nicht korrekt an.'],
  ['workstation-local-app',1,'Arbeitsplatz / Anwendung','Eine lokal verwendete Standardanwendung startet bei einer Person nicht wie erwartet.'],
  ['workstation-camera',1,'Arbeitsplatz / Kamera','Eine Person kann die Kamera ihres Arbeitsplatzes in einer Konferenzanwendung nicht wie gewohnt verwenden.'],
  ['workstation-local-storage',1,'Arbeitsplatz / Lokaler Speicher','Auf einem einzelnen Arbeitsplatz kann eine Person neue Arbeitsdateien nicht wie erwartet speichern.'],
  ['shared-signin',2,'Anmeldung','Mehrere Anwender melden ein ähnliches Anmeldeproblem an einem gemeinsamen Zugangspunkt.'],
  ['shared-print-queue',2,'Druckdienst','Mehrere Beschäftigte können eine gemeinsam genutzte Druckwarteschlange nicht normal verwenden.'],
  ['shared-m365',2,'Microsoft 365','Eine kleine Anwendergruppe meldet ein Problem in einem Standarddienst von Microsoft 365.'],
  ['shared-files',2,'Dateidienst','Mehrere Personen melden eingeschränkten Zugriff auf eine gemeinsame Arbeitsablage.'],
  ['shared-wifi',2,'WLAN','An einem Arbeitsbereich treten bei mehreren Geräten Verbindungsprobleme auf.'],
  ['shared-endpoint',2,'Clientverwaltung','Eine Gruppe von Geräten zeigt nach einem regulären Verwaltungsablauf dasselbe Verhalten.'],
  ['shared-mail-access',2,'Microsoft 365 / Postfach','Mehrere Mitglieder einer Arbeitsgruppe können eine gemeinsame Postfachfunktion nicht normal verwenden.'],
  ['shared-remote-access',2,'Fernzugriff','Eine kleine Gruppe kann einen gemeinsamen Fernzugriff nicht zuverlässig verwenden; andere Zugänge funktionieren weiter.'],
  ['ad-lockout',3,'Active Directory / Anmeldung','Ein wiederkehrendes Anmeldeproblem erfordert Prüfung von Konto, Client und Verzeichnisdienst.'],
  ['dns-resolution',3,'DNS','Interne Namen lassen sich aus einem Teil der Umgebung nicht konsistent auflösen.'],
  ['dhcp-scope',3,'DHCP','Ein Teil der Clients erhält keine erwartete Netzwerkkonfiguration.'],
  ['gpo-application',3,'Gruppenrichtlinien','Eine Richtlinie wird auf betroffenen Clients nicht wie erwartet wirksam.'],
  ['file-permissions',3,'Dateiserver / Berechtigungen','Der Zugriff auf eine Ressource weicht für bestimmte Benutzer von der erwarteten Berechtigung ab.'],
  ['certificate-service',3,'Zertifikate','Ein interner Dienst meldet bei einem Teil der Zugriffe ein Zertifikatsproblem.'],
  ['scheduled-service-account',3,'Dienstkonto / Aufgabenplanung','Eine zentrale geplante Aufgabe verhält sich unter ihrem Dienstkonto anders als bei manueller Ausführung.'],
  ['dns-dynamic-registration',3,'DNS / Dynamische Registrierung','Ein Teil administrierter Geräte ist nach einem regulären Standortwechsel unter internen Namen nicht konsistent erreichbar.'],
  ['vm-service-chain',4,'VMware / Windows-Dienst','Eine virtuelle Serveranwendung ist gestört; mehrere abhängige Dienste kommen als Fehlergrenze infrage.'],
  ['backup-window',4,'Veeam / Backup','Ein geplanter Sicherungslauf oder die Wiederherstellbarkeit einer Servergruppe ist beeinträchtigt.'],
  ['storage-latency',4,'Storage / Virtualisierung','Mehrere virtuelle Systeme reagieren langsam; Plattform- und Speicherabhängigkeiten sind relevant.'],
  ['certificate-chain',4,'Zertifikatskette / Webdienst','Ein interner Webdienst ist für manche Clients nicht erreichbar; mehrere Teile der Dienstkette müssen eingegrenzt werden.'],
  ['routing-segment',4,'Routing / VLAN','Ein Netzsegment erreicht einzelne interne Ziele nicht, andere Ziele bleiben erreichbar.'],
  ['identity-dependency',4,'Identität / Fachanwendung','Eine Fachanwendung hat Authentifizierungsprobleme mit Abhängigkeiten zu mehreren Basisdiensten.'],
  ['dhcp-failover',4,'DHCP / Failover','Clients verschiedener VLANs erhalten nach einer regulären Wartung unterschiedliche Adresskonfigurationen. DHCP-Partner, Relay-Pfade und Lease-Zustände müssen mit unabhängigen Befunden korreliert werden; die Wiederherstellung muss bestehende Leases schützen.'],
  ['endpoint-management-chain',4,'Clientverwaltung / Dienstkette','Eine verwaltete Clientgruppe übernimmt eine sicherheitsrelevante Konfiguration nur teilweise. Verwaltungskanal, Richtlinienverarbeitung und lokale Dienstabhängigkeiten müssen eingegrenzt und die Wiederherstellung auf mehreren Clients überprüft werden.'],
  ['linux-systemd-chain',4,'Linux / systemd / Webdienst','Eine interne Anwendung auf Linux ist nach einer regulären Wartung teilweise nicht verfügbar. Dienstabhängigkeiten, Prozesszustände und erreichbare Anwendungsfunktionen müssen mit systemd-/Journal-Befunden gegeneinander abgegrenzt werden.'],
  ['linux-file-acl',4,'Linux / Dateirechte / ACL','Ein Linux-Anwendungsdienst kann auf einen Teil seiner Arbeitsdateien nicht wie erwartet zugreifen, während interaktive Benutzer andere Ergebnisse sehen. Dienstidentität, effektive Rechte und Einhängezustände müssen nachvollziehbar eingegrenzt werden.'],
  ['hybrid-identity',5,'Hybride Identität','An einem Standort weichen Anmeldeergebnisse zwischen Cloud- und lokalen Ressourcen ab.'],
  ['site-vpn-dns',5,'Standort / VPN / DNS','Ein entfernter Standort erreicht zentrale Dienste teilweise; Fehlerbilder unterscheiden sich nach Ziel.'],
  ['wan-routing',5,'WAN / Routing','Nach einer Netzänderung sind mehrere Dienste an einem Außenstandort beeinträchtigt.'],
  ['m365-federation',5,'Microsoft 365 / Föderation','Eine Benutzergruppe hat standortabhängige Probleme beim Zugriff auf hybride Dienste.'],
  ['replication-site',5,'Verzeichnis / Standortreplikation','Änderungen oder Anmeldungen verhalten sich zwischen Standorten zeitlich unterschiedlich.'],
  ['backup-recovery-site',5,'Backup / Wiederherstellung','Ein Wiederherstellungsbedarf betrifft einen entfernten Standort und zentrale Sicherungswege.'],
  ['linux-dns-split',5,'Linux / DNS / Standortauflösung','Linux-Anwendungen an mehreren Standorten erreichen denselben internen Dienst unterschiedlich. Resolverpfade, DNS-Ansichten und nachgelagerte Dienstzugriffe müssen mit standortbezogenen Befunden korreliert werden.'],
  ['linux-pam-directory',5,'Linux / PAM / Verzeichnisintegration','Anmeldungen an Linux-Systemen einer hybriden Umgebung verhalten sich je nach Zugang und Standort unterschiedlich. PAM-/SSSD-Befunde, Verzeichnisanbindung und Zeit-/Namensabhängigkeiten müssen sicher eingegrenzt werden.'],
  ['linux-backup-consistency',5,'Linux / Backup / Anwendungskonsistenz','Für eine verteilte Linux-Anwendung widersprechen sich Sicherungsstatus und ein isolierter Wiederherstellungstest. Anwendungszustand, Snapshot-Reihenfolge und Sicherungspfad müssen anhand mehrerer unabhängiger Befunde eingegrenzt werden.'],
  ['linux-container-network',5,'Linux / Container / Netzwerk','Ein Linux-Containerdienst ist aus verschiedenen Netzen unterschiedlich erreichbar, während einzelne Container gesund erscheinen. Hostnetz, Namensauflösung, Dienstendpunkte und Sicherheitsregeln müssen zu einer gemeinsamen Fehlerdomäne zusammengeführt werden.'],
  ['critical-name-path',6,'Kritischer Namens- und Dienstpfad','Mehrere kritische Anwendungen fallen über verschiedene Segmente aus; gemeinsame Infrastrukturabhängigkeiten sind zu untersuchen.'],
  ['identity-control-plane',6,'Identitätsplattform','Authentifizierungsausfälle betreffen mehrere Standorte und Dienste mit unterschiedlichen Anmeldewegen.'],
  ['virtualization-cluster',6,'Virtualisierung / Cluster','Eine kritische Plattformgruppe ist degradiert; Auswirkungen reichen über mehrere abhängige Dienste.'],
  ['storage-failover',6,'Storage / Failover','Eine zentrale Speicher- oder Failover-Kette beeinträchtigt mehrere Anwendungen mit unterschiedlicher Dringlichkeit.'],
  ['network-segmentation',6,'Netzwerk / Sicherheitszonen','Mehrere wichtige Dienste sind aus unterschiedlichen Sicherheitszonen nicht konsistent erreichbar.'],
  ['recovery-control',6,'Wiederanlauf / Backup-Steuerung','Ein kritischer Wiederanlauf ist beeinträchtigt und hängt von mehreren Infrastrukturkomponenten ab.'],
  ['linux-ha-quorum',6,'Linux / HA-Cluster / Quorum','Eine kritische Linux-HA-Anwendung ist nach einem Standortereignis degradiert. Clusterzustand, Quorum-/Fencing-Sicht, Storagezugriff und virtuelle Dienstadresse liefern unterschiedliche Symptome, die vor einer risikobehafteten Wiederaufnahme korreliert werden müssen.'],
  ['linux-pki-federation',6,'Linux / PKI / Föderation','Mehrere Linux- und Windows-Anwendungen einer föderierten Umgebung haben unterschiedliche Authentifizierungs- oder Vertrauensprobleme. Zertifikatsketten, Zeitbezug, Proxy-Wege und Identitätsabhängigkeiten müssen aus unabhängigen Belegen abgegrenzt werden.'],
  ['linux-storage-recovery',6,'Linux / Storage / Wiederanlauf','Eine kritische Linux-Plattform zeigt nach einem Wiederanlauf unterschiedliche Datei-, Mount- und Dienstzustände. Blockgerätepfade, LVM-/Dateisystemsicht und Clusterabhängigkeiten müssen vor schreibenden Eingriffen sicher korreliert werden.'],
  ['linux-policy-routing',6,'Linux / Policy-Routing / Sicherheitszonen','Mehrere kritische Dienste über Linux-Gateways und verschiedene Sicherheitszonen sind nur aus bestimmten Richtungen gestört. Routingtabellen, Regelreihenfolge, Rückwege und Zustandsinformationen müssen zu einer einzelnen belegten Hauptursache eingegrenzt werden.'],
  ...HARDWARE_SCENARIOS,
].map(([id, level, category, briefing]) => Object.freeze({ id, level, category, briefing }));

function difficultyFor(level) {
  const profile = PROFILES[Number.isInteger(level) && level >= 1 && level <= 6 ? level - 1 : 2];
  return { ...profile };
}

module.exports = { PROFILES, SCENARIOS, COMPLEXITY, difficultyFor };
