'use strict';

const crypto = require('node:crypto');
const { HARDWARE_CAUSES, hardwareIngredients } = require('./hardware-training');

// Curated, technically plausible fault modes by domain. Ingredients below only
// Combinations stay within the matching family.
const CAUSES = {
  'Arbeitsplatz / Peripherie': ['USB-Energiesparverwaltung deaktiviert den Geräteport nach dem Standby', 'veralteter passender Gerätetreiber nach einem regulären Update', 'lokal falsches Standardgerät nach Anschlusswechsel'],
  'Windows-Arbeitsplatz': ['beschädigter benutzerspezifischer Cache', 'hängender lokaler Hintergrunddienst', 'fehlerhafter benutzerspezifischer Registry-Wert'],
  Drucken: ['lokal pausierte Warteschlange mit festhängendem Auftrag', 'falscher Standarddrucker nach Gerätewechsel', 'beschädigter lokaler Druckertreiber'],
  'Arbeitsplatz / Audio': ['exklusiver Audiomodus blockiert den Konferenzclient', 'falsches Standardaufnahmegerät nach Dockwechsel', 'lokal stummgeschalteter Kommunikationskanal'],
  'Arbeitsplatz / Anzeige': ['falsche Skalierung nach Docking-Wechsel', 'inkompatible Bildwiederholrate am externen Monitor', 'veraltetes lokales Anzeigeprofil'],
  'Arbeitsplatz / Anwendung': ['beschädigter Anwendungscache im Benutzerprofil', 'fehlende benutzerspezifische Laufzeitregistrierung', 'konfligierende lokale Add-in-Version'],
  'Arbeitsplatz / Kamera': ['Kamerazugriff in den lokalen Datenschutzeinstellungen entzogen', 'anderer Prozess hält das Kameragerät exklusiv geöffnet', 'veralteter USB-Kameratreiber nach Dockwechsel'],
  'Arbeitsplatz / Lokaler Speicher': ['Benutzerprofilvolumen nahe dem Kontingent', 'lokaler Ordner schreibgeschützt geerbt', 'Synchronisationsclient hält die Datei exklusiv geöffnet'],
  Anmeldung: ['abgelaufenes Kennwort in einem gespeicherten Anmeldekontext', 'gesperrtes Konto durch veraltete gespeicherte Zugangsdaten', 'fehlerhafte Zuweisung einer gemeinsamen Anmeldegruppe'],
  'Druckdienst': ['Druckwarteschlangendienst mit blockiertem Auftrag', 'veralteter Treiber auf dem Druckserver', 'falsche Portzuordnung der gemeinsamen Queue'],
  'Microsoft 365': ['abgelaufene Anmeldesitzung im Office-Token-Cache', 'fehlerhafte bedingte Zugriffszuweisung für die betroffene Gruppe', 'Dienstzustand des Mandanten-Add-ins inkonsistent'],
  Dateidienst: ['geänderte Gruppenmitgliedschaft noch nicht im Anmeldetoken', 'abweichende Freigabe- und NTFS-Berechtigung', 'offline gehaltene Datei mit Konfliktstatus'],
  WLAN: ['abgelaufenes WLAN-Zertifikat auf der betroffenen Gerätegruppe', 'falsches VLAN-Profil am Access-Point-Port', 'inkonsistente 802.1X-Gruppenzuweisung'],
  Clientverwaltung: ['Gerätegruppe erhält eine veraltete Richtlinienrevision', 'Verwaltungsagent hängt bei der Richtlinienverarbeitung', 'Zielgruppe ist aus einer dynamischen Zuweisung herausgefallen'],
  'Microsoft 365 / Postfach': ['fehlende Berechtigung auf das freigegebene Postfach', 'veralteter Autodiscover-Eintrag im Outlook-Profil', 'delegierte Berechtigung wurde nicht auf die betroffene Gruppe angewendet'],
  Fernzugriff: ['abgelaufenes Clientzertifikat für den VPN-Zugang', 'falsche Split-DNS-Zuweisung im VPN-Profil', 'Gruppenrichtlinie verweigert dem Teil der Gruppe den Tunnel'],
  'Active Directory / Anmeldung': ['Dienstkonto verwendet ein abgelaufenes Kennwort', 'Anmeldeversuche stammen von einem veralteten gespeicherten Credential', 'Konto ist durch eine unerwartete Gruppenrichtlinie gesperrt'],
  DNS: ['veralteter DNS-Cache auf einem Resolver', 'falscher A-Record in einer internen DNS-Ansicht', 'bedingte Weiterleitung zeigt auf den nicht autoritativen Partner'],
  DHCP: ['Scope-Adressbereich ist durch verwaiste Leases ausgeschöpft', 'DHCP-Option für DNS-Server ist im betroffenen Scope falsch', 'Relay-Ziel des VLANs verweist auf einen alten DHCP-Partner'],
  Gruppenrichtlinien: ['WMI-Filter schließt die betroffene Gerätegruppe aus', 'Replikationsstand der Richtlinie ist zwischen DCs uneinheitlich', 'Sicherheitsfilter enthält die Zielgruppe nicht mehr'],
  'Dateiserver / Berechtigungen': ['NTFS-ACL enthält eine unerwartete Verweigerung', 'verschachtelte Gruppe fehlt in der effektiven Freigabeberechtigung', 'Dienst greift mit einer anderen Identität als erwartet zu'],
  Zertifikate: ['Zwischenzertifikat fehlt auf dem betroffenen Dienstknoten', 'Zertifikat ist abgelaufen und Erneuerung wurde nicht gebunden', 'SAN des erneuerten Zertifikats deckt den verwendeten Namen nicht ab'],
  'Dienstkonto / Aufgabenplanung': ['Kennwort des Aufgabenkontos wurde rotiert, Credential aber nicht aktualisiert', 'Aufgabe startet mit falschem Arbeitsverzeichnis', 'Batch-Logon-Recht fehlt der Dienstidentität'],
  'DNS / Dynamische Registrierung': ['dynamische Aktualisierung wird durch veraltete Secure-DNS-Berechtigung abgewiesen', 'DHCP-Server registriert Namen mit falschem Aktualisierungskonto', 'verwaister DNS-Record kollidiert mit der neuen Lease'],
  'VMware / Windows-Dienst': ['Dienstabhängigkeit startet vor dem bereitgestellten Datenvolume', 'VM-Snapshot-Konsolidierung erzeugt anhaltende Storage-Latenz', 'Dienstkonto hat nach Rotation keinen Zugriff auf den Backend-Endpunkt'],
  'Veeam / Backup': ['Repository-Kontingent ist durch aufbewahrte Restore Points erschöpft', 'Gastverarbeitung scheitert an abgelaufenen Guest-Credentials', 'Proxy-Zuweisung überlastet den geplanten Backup-Slot'],
  'Storage / Virtualisierung': ['ein Storage-Pfad ist degradiert und Multipath nutzt nur einen Pfad', 'Datastore-Latenz durch ausstehende Snapshot-Konsolidierung', 'Queue-Tiefe des Hosts begrenzt mehrere VMs gleichzeitig'],
  'Zertifikatskette / Webdienst': ['Load-Balancer-Knoten präsentieren unterschiedliche Zertifikatsketten', 'Intermediate fehlt auf einem Backend-Knoten', 'SNI-Bindung zeigt nach Zertifikatserneuerung auf den alten Listener'],
  'Routing / VLAN': ['Rückroute für das betroffene VLAN fehlt auf einem L3-Hop', 'ACL erlaubt den Hinweg, verwirft aber den Rückverkehr', 'Portprofil weist einen Teil der Clients dem falschen VLAN zu'],
  'Identität / Fachanwendung': ['Anwendungsdienst nutzt ein abgelaufenes Kerberos-Keytab', 'SPN ist doppelt auf zwei Dienstkonten registriert', 'Fachanwendung fragt einen veralteten Identitätsendpunkt ab'],
  'DHCP / Failover': ['Failover-Partner sind nach Wartung im Partner-Down-Zustand', 'Scope-Konfiguration ist zwischen Partnern nicht repliziert', 'Relay eines VLANs sendet an nur einen nicht erreichbaren Partner'],
  'Clientverwaltung / Dienstkette': ['Verwaltungszertifikat ist auf einem Relay abgelaufen', 'Richtlinienrevision wurde verteilt, aber lokaler Agent verarbeitet sie nicht', 'Abhängiger Update-Dienst ist durch eine fehlerhafte Wartungsrichtlinie deaktiviert'],
  'Linux / systemd / Webdienst': ['systemd-Override setzt eine falsche Abhängigkeit vor dem Mount', 'EnvironmentFile des Dienstes enthält einen veralteten Backend-Endpunkt', 'Dienst läuft mit einer inkompatiblen Drop-in-Konfiguration'],
  'Linux / Dateirechte / ACL': ['ACL-Maske entfernt das erforderliche Schreibrecht der Dienstgruppe', 'systemd-Dienstidentität weicht vom interaktiven Benutzer ab', 'Mount wurde nach Wartung mit schreibgeschützten Optionen eingebunden'],
  'Hybride Identität': ['Entra-Connect-Synchronisierung überspringt eine verschobene OU', 'falscher UPN-Suffix für den betroffenen Standort', 'Passwort-Hash-Synchronisierung bleibt hinter dem lokalen Änderungsstand zurück'],
  'Standort / VPN / DNS': ['VPN-Client erhält einen veralteten standortbezogenen DNS-Suffix', 'Tunnelroute für ein zentrales Subnetz fehlt am Außenstandort', 'DNS-Forwarder am Standort liefert eine veraltete interne Ansicht'],
  'WAN / Routing': ['Policy-Route bevorzugt nach der Änderung den falschen WAN-Uplink', 'BGP-Präfixfilter nimmt eine benötigte Rückroute nicht an', 'MTU-Abweichung verwirft große Antworten über den neuen Pfad'],
  'Microsoft 365 / Föderation': ['Föderationsmetadaten sind auf einem Proxy-Knoten veraltet', 'Zeitabweichung verursacht standortabhängige SAML-Assertion-Ablehnung', 'bedingte Zugriffsrichtlinie schließt ein Standortnetz falsch ein'],
  'Verzeichnis / Standortreplikation': ['Replikationsverbindung eines Standortpartners ist deaktiviert', 'KCC-Topologie hält nach Subnetzänderung einen veralteten Site-Link', 'DNS-SRV-Records des entfernten DCs sind veraltet'],
  'Backup / Wiederherstellung': ['WAN-Repository-Pfad ist erreichbar, aber für den Proxy nicht beschreibbar', 'Snapshot-Reihenfolge verletzt die Anwendungs-Konsistenzgruppe', 'Katalogdatenbank zeigt einen veralteten Wiederherstellungspunkt'],
  'Linux / DNS / Standortauflösung': ['systemd-resolved verwendet standortfremde DNS-Routen', 'Split-DNS-Ansicht des entfernten Resolvers fehlt für die Anwendungszone', 'lokaler Cache hält einen alten CNAME-Zielwert'],
  'Linux / PAM / Verzeichnisintegration': ['SSSD-Cache enthält eine veraltete Gruppenmitgliedschaft', 'PAM-Stack überspringt auf einem Standort den erforderlichen SSSD-Schritt', 'Kerberos-Zeitabweichung führt zu sporadisch abgewiesenen Tickets'],
  'Linux / Backup / Anwendungskonsistenz': ['Snapshot wird vor dem erfolgreichen Datenbank-Quiesce erstellt', 'Backup-Proxy liest einen veralteten Mount-Pfad', 'Aufbewahrungsjob entfernt den anwendungsbezogenen konsistenten Punkt zu früh'],
  'Linux / Container / Netzwerk': ['Host-NAT-Regel leitet Rückverkehr nicht in den Container-Namespace', 'Service-Discovery zeigt auf eine alte Container-IP', 'NetworkPolicy erlaubt nur einen der beiden benötigten Namespace-Pfade'],
  'Kritischer Namens- und Dienstpfad': ['Standortresolver liefern widersprüchliche autoritative Antworten', 'Anycast-Dienstadresse wird durch eine fehlende Rückroute asymmetrisch erreicht', 'Load-Balancer-Pool enthält einen Knoten mit veraltetem Backend-Ziel'],
  Identitätsplattform: ['Zeitabweichung bricht Kerberos und föderierte Tokens unterschiedlich', 'Replikation der Verzeichnisänderung ist an einem Standort blockiert', 'ein zwischengeschalteter Token-Dienst präsentiert ein abgelaufenes Signing-Zertifikat'],
  'Virtualisierung / Cluster': ['Quorumdisk ist erreichbar, aber Cluster-Netzwerkpartition verhindert sichere Mehrheitsbildung', 'Fencing-Agent nutzt nach Credential-Rotation ungültige Zugangsdaten', 'HA-Heartbeat läuft über einen falsch priorisierten VLAN-Pfad'],
  'Storage / Failover': ['Multipath-ALUA-Priorität lenkt Schreib-I/O auf einen degradierten Pfad', 'Failover-Reservation ist nach Wartung auf einem Host veraltet', 'Replikationsziel ist online, aber der erforderliche Konsistenzpunkt fehlt'],
  'Netzwerk / Sicherheitszonen': ['Rückregel für einen transiten Dienst fehlt in der Firewall-Zonenmatrix', 'Policy-Route führt Antworten über einen anderen zustandsbehafteten Firewall-Knoten', 'Objektgruppe der Zugriffskontrolle enthält ein veraltetes Subnetz'],
  'Wiederanlauf / Backup-Steuerung': ['Orchestrierung nutzt eine veraltete Abhängigkeit zwischen Recovery-Gruppen', 'Repository-Katalog ist nach Teilwiederherstellung nicht konsistent', 'Fencing-Freigabe wurde vor dem bestätigten Datenreplikationsstand erteilt'],
  'Linux / HA-Cluster / Quorum': ['Corosync-Ring verliert Heartbeats wegen MTU-Abweichung auf dem Cluster-VLAN', 'Quorum-Gerät antwortet über einen degradierten iSCSI-Pfad', 'SBD-Watchdog wird durch eine abweichende Timeout-Konfiguration zu spät ausgelöst', 'Pacemaker-Ressource bleibt wegen eines veralteten Standort-Constraints gesperrt', 'Fencing-Ressource verwendet nach Rotation ein nicht aktualisiertes Secret', 'Cluster-Mitglied zählt wegen einer asymmetrischen Corosync-Ringadresse als getrennt'],
  'Linux / PKI / Föderation': ['SAML-Signing-Zertifikat des IdP wurde rotiert, aber ein SP vertraut noch dem alten Schlüssel', 'OpenSSL-Truststore eines Linux-Proxys enthält die neue Zwischenstelle nicht', 'NTP-Abweichung lässt SAML-Assertions auf einem Knoten ablaufen', 'Föderationsmetadaten werden über einen veralteten Reverse-Proxy-Cache ausgeliefert', 'mTLS-Clientzertifikat des Dienstkontos ist auf einem Backend nicht erneuert', 'OIDC-JWKS-Cache eines Dienstes hält den vorherigen Schlüsselsatz'],
  'Linux / Storage / Wiederanlauf': ['initramfs enthält nach Pfadänderung eine veraltete multipath-Konfiguration', 'LVM aktiviert nach Neustart eine gleichnamige VG auf dem falschen Gerätepfad', 'Dateisystem-Journal wird wegen schreibgeschützter Recovery-Option nicht wiedergegeben', 'systemd wartet auf eine UUID, die sich nach SAN-Failover geändert hat', 'udev-Regel erzeugt nach Geräte-Reihenfolgewechsel einen abweichenden Symlink', 'fstrim- oder Mount-Unit startet vor abgeschlossener Multipath-Erkennung'],
  'Linux / Policy-Routing / Sicherheitszonen': ['ip rule priorisiert eine Quelltabelle vor der vorgesehenen VPN-Tabelle', 'nftables-Conntrack-Zone unterscheidet sich zwischen Hin- und Rückweg', 'VRF-zugehörige Route fehlt auf einem Gateway für das Antwortpräfix', 'rp_filter verwirft asymmetrischen Rückverkehr am Linux-Router', 'nftables-Regel für established-Verbindungen liegt hinter einer verwerfenden Zonenregel', 'Policy-Route bindet Antworten an die Management-Schnittstelle statt an den Transit-Uplink'],
};

const ADDITIONAL_CAUSES = {
  'Arbeitsplatz / Peripherie': ['Geräteinstanz ist nach Dockwechsel als deaktiviert markiert', 'USB-Hub liefert am betroffenen Port nicht genügend Strom', 'Anwendung bindet noch an die alte Geräteinstanz'],
  'Windows-Arbeitsplatz': ['beschädigter Windows-Suchindex im Benutzerprofil', 'lokaler Dienst startet wegen eines verzögerten Abhängigkeitsstarts nicht', 'Benutzerprofil wird durch eine verwaiste Sperrdatei nur temporär geladen'],
  Drucken: ['Anwendung verwendet ein nicht unterstütztes Papierformat', 'lokale Druckerzuordnung zeigt auf eine entfernte Queue', 'Druckauftrag bleibt wegen eines beschädigten Spooler-Auftrags hängen'],
  'Arbeitsplatz / Audio': ['Kommunikationsgerät ist im Konferenzclient separat deaktiviert', 'Audiotreiber wurde nach dem Ruhezustand nicht wieder initialisiert', 'Bluetooth-Headset wechselt auf ein ungeeignetes Hands-Free-Profil'],
  'Arbeitsplatz / Anzeige': ['Dock-Firmware meldet eine nicht unterstützte Monitor-EDID', 'Grafiktreiber hält nach Standby eine veraltete Monitoranordnung', 'Anwendung öffnet auf einem getrennten virtuellen Desktop'],
  'Arbeitsplatz / Anwendung': ['Anwendung kann ihr benutzerspezifisches Konfigurationsverzeichnis nicht beschreiben', 'lokale Laufzeitbibliothek wird durch eine falsche PATH-Reihenfolge geladen', 'geplantes Anwendungsupdate wurde pro Benutzer nur teilweise angewendet'],
  'Arbeitsplatz / Kamera': ['Kameratreiber wurde durch Windows-Datenschutzblockierung deaktiviert', 'Konferenzclient verwendet eine nicht mehr vorhandene Kamera-ID', 'USB-Kamerahub verliert nach Energiesparmodus die Geräteverbindung'],
  'Arbeitsplatz / Lokaler Speicher': ['temporäre Profildateien belegen den freien Platz des Systemlaufwerks', 'Dateiversionsverlauf hält den Zielordner in einem ausstehenden Status', 'Cloud-Synchronisation hat den Zielpfad auf Files On-Demand umgestellt'],
  Anmeldung: ['gespeicherte Zugangsdaten verwenden einen veralteten Benutzernamen', 'Windows Hello PIN ist nach TPM-Wiederherstellung nicht neu registriert', 'Arbeitsplatz verwendet einen nicht erreichbaren Domänencontroller-Standort'],
  'Druckdienst': ['Spooler-Dienstkonto hat das Recht zum Rendern auf dem Server verloren', 'Queue ist durch eine ausstehende Treiberisolation blockiert', 'Druckserver veröffentlicht einen veralteten UNC-Queue-Namen'],
  'Microsoft 365': ['Office-Anwendung erhält wegen falschem Proxy eine veraltete Autodiscover-Antwort', 'Add-in-Version ist mit dem aktuellen Office-Kanal inkompatibel', 'Gerätestatus wird in der bedingten Zugriffsrichtlinie nicht korrekt ausgewertet'],
  Dateidienst: ['DFS-Namespace verweist auf ein nicht erreichbares Ziel', 'Offline Files synchronisiert ein veraltetes lokales Replikat', 'SMB-Sitzung nutzt nach Rollenwechsel einen veralteten Server-Endpunkt'],
  WLAN: ['RADIUS-Server akzeptiert die Geräteidentität wegen falscher Zertifikatskette nicht', 'Access-Point hat eine veraltete VLAN-Zuweisung für den SSID-Tag', 'Kanalüberlastung verursacht auf einem AP wiederholte 802.11-Roamingabbrüche'],
  Clientverwaltung: ['Gerät hat ein doppeltes Enrollment-Objekt und erhält falsche Richtlinien', 'MDM-Zertifikat des Geräts ist abgelaufen', 'Verwaltungsserver verarbeitet den Gerätestatus aus einer alten Inventarisierung'],
  'Microsoft 365 / Postfach': ['Automapping der Postfachberechtigung ist im Outlook-Profil deaktiviert', 'Postfach ist nach Lizenzänderung nicht vollständig provisioniert', 'Exchange-Online-Berechtigung wurde auf eine verschachtelte Gruppe statt direkte Mitglieder gesetzt'],
  Fernzugriff: ['VPN-Profil enthält eine veraltete Gateway-Adresse', 'MFA-Richtlinie fordert für die Gerätegruppe eine nicht zugewiesene Methode', 'VPN-Client installiert eine überlappende Route für das zentrale Subnetz'],
  'Active Directory / Anmeldung': ['Computerobjekt-Kennwort weicht nach Snapshot-Rollback vom DC-Zustand ab', 'gesperrtes Konto wird durch einen geplanten Dienst mit altem Kennwort erneut gesperrt', 'Anmeldeskript greift auf ein nicht erreichbares SYSVOL-Replikat zu'],
  DNS: ['Aging/Scavenging entfernt einen noch benötigten statischen Eintrag', 'DNS-Client erhält über DHCP eine falsche Suchsuffixliste', 'DNSSEC-Validierung verwirft eine fehlerhaft signierte Antwort'],
  DHCP: ['reservierte Adresse kollidiert mit einer statischen Clientkonfiguration', 'Lease-Dauer ist im betroffenen Scope für den Einsatz zu kurz gesetzt', 'DHCP-Server vergibt eine falsche Standardgateway-Option'],
  Gruppenrichtlinien: ['Loopback-Verarbeitungsmodus ist für die Ziel-OU falsch gesetzt', 'SYSVOL enthält eine ältere GPT-Version als Active Directory', 'Client verarbeitet Richtlinie wegen fehlender Leseberechtigung nicht'],
  'Dateiserver / Berechtigungen': ['DFS-Ziel hat abweichende NTFS-ACL gegenüber dem Namespace-Partner', 'Besitzerwechsel hat geerbte Verzeichnisrechte unterbrochen', 'SMB-Zugriff wird durch Access-Based Enumeration verborgen'],
  Zertifikate: ['Zertifikatsvorlage erlaubt dem Dienstkonto keine Enrollment-Berechtigung', 'CRL-Verteilungspunkt ist aus dem betroffenen Segment unerreichbar', 'Autoenrollment erneuert das Zertifikat, aber der Dienst lädt es nicht neu'],
  'Dienstkonto / Aufgabenplanung': ['Aufgabe läuft mit deaktivierter Option für nicht gespeicherte Kennwörter', 'Dienstkonto fehlt das Recht „Anmelden als Stapelverarbeitungsauftrag“ nach GPO-Änderung', 'Aufgabe ist an ein nicht verfügbares Netzlaufwerk gebunden'],
  'DNS / Dynamische Registrierung': ['DHCP-Name-Schutz verhindert kollidierende dynamische Registrierung', 'Update wird wegen abweichender Eigentümerschaft des DNS-Records abgewiesen', 'DHCP-Lease erneuert, aber dynamischer Update-Request erreicht den autoritativen DNS-Server nicht'],
  'VMware / Windows-Dienst': ['VMware Tools liefert nach Update keine korrekte Gast-IP an den Dienstmonitor', 'Windows-Dienst wartet auf ein nicht gemountetes VMware-Shared-Volume', 'vNIC verbindet nach Portgruppenwechsel mit einem falschen dvPort'],
  'Veeam / Backup': ['VSS-Writer des Gastbetriebssystems bleibt im Fehlerzustand', 'Immutable-Repository verweigert aufgrund abweichender Systemzeit neue Objekte', 'Backup-Kette kann wegen beschädigter Metadaten den nächsten Increment nicht erstellen'],
  'Storage / Virtualisierung': ['VMFS-Sperre bleibt nach abrupt beendetem Hostzugriff bestehen', 'Storage-Controller meldet einen überlasteten Frontend-Port', 'Datastore-Kapazitätsreserve ist durch Thin-Provisioning erschöpft'],
  'Zertifikatskette / Webdienst': ['Backend liefert ein Zertifikat ohne erforderliche ServerAuth-EKU', 'TLS-Listener bindet nach Erneuerung weiterhin an den alten Zertifikatsspeicher', 'OCSP-Responder ist aus einem Teil der Clientnetze nicht erreichbar'],
  'Routing / VLAN': ['native VLAN-Einstellung weicht zwischen den beiden Trunk-Enden ab', 'statische Route hat nach Präfixänderung eine falsche Metrik', 'Gateway-Redundanz zeigt den virtuellen Router auf den falschen aktiven Knoten'],
  'Identität / Fachanwendung': ['Kerberos-Delegierung ist für den Backend-SPN nicht erlaubt', 'Anwendung bindet nach Zertifikatswechsel an den alten LDAP-Endpunkt', 'JWT-Validierung verwendet auf einem Knoten einen veralteten Audience-Wert'],
  'DHCP / Failover': ['MCLT verhindert nach Partner-Rückkehr erwartete Lease-Neuvergabe', 'Failover-Partner haben unterschiedliche Scope-Optionen', 'DHCP-Relay fügt eine falsche Option 82 Circuit-ID hinzu'],
  'Clientverwaltung / Dienstkette': ['Client-Push-Zertifikat ist nicht auf die neue Verwaltungsrolle übertragen', 'Dienstabhängigkeit für den Richtlinienagenten startet nach Update nicht', 'Proxy-Ausnahme blockiert den Rückkanal des Verwaltungsagenten'],
  'Linux / systemd / Webdienst': ['Socket-Unit kollidiert mit direktem Port-Binding des Dienstes', 'systemd-Startlimit bleibt nach wiederholtem Konfigurationsfehler erreicht', 'TLS-Dateipfad in der Drop-in-Unit verweist auf das alte Zertifikat'],
  'Linux / Dateirechte / ACL': ['umask der systemd-Unit erzeugt zu restriktive neue Arbeitsdateien', 'NFSv4-ACL unterscheidet sich von der erwarteten POSIX-ACL', 'SELinux-Kontext des eingebundenen Verzeichnisses blockiert den Dienstzugriff'],
  'Hybride Identität': ['ImmutableID stimmt nach Kontenmigration nicht mit dem Quellobjekt überein', 'Entra-Connect-Connector verwendet falsche OU-Filter', 'Cloud-Konto ist nach Soft-Match mit einem anderen lokalen Objekt verbunden'],
  'Standort / VPN / DNS': ['VPN-Phase-2-Selector enthält das Anwendungsnetz nicht', 'Standort-DNS-Forwarder verwendet den falschen Quellinterface-Pfad', 'Firewall-NAT übersetzt die VPN-Quelle vor der internen ACL unerwartet'],
  'WAN / Routing': ['BGP-Präfix wird mit einer zu restriktiven Community verworfen', 'MPLS-CE kündigt nach Wartung ein zu breites Aggregat an', 'asymmetrischer WAN-Rückweg wird durch zustandsbehaftete Firewall verworfen'],
  'Microsoft 365 / Föderation': ['WAP-Knoten besitzen unterschiedliche Token-Entschlüsselungszertifikate', 'Federation Service Name zeigt im DNS auf einen alten Proxy', 'OAuth-Reply-URL der Anwendung stimmt nicht mit dem registrierten Endpoint überein'],
  'Verzeichnis / Standortreplikation': ['USN-Rollback-Schutz verhindert Replikation eines zurückgesetzten DCs', 'Site-Link-Kosten lenken Replikation über den ausgefallenen WAN-Link', 'SYSVOL-DFSR bleibt nach Datenbank-Recovery im Initial-Sync'],
  'Backup / Wiederherstellung': ['Restore-Proxy kann das verschlüsselte Repository wegen fehlendem Schlüssel nicht lesen', 'Anwendungslog-Truncation läuft vor bestätigtem Backup-Commit', 'Recovery-Point-Katalog ordnet VM-Identität nach Umbenennung falsch zu'],
  'Linux / DNS / Standortauflösung': ['resolv.conf wird durch NetworkManager mit dem globalen statt Link-DNS überschrieben', 'DNSSEC-Validierung scheitert nur an einem Resolver mit falscher Zeit', 'search-Domain-Reihenfolge lenkt den Kurznamen auf eine falsche Zone'],
  'Linux / PAM / Verzeichnisintegration': ['SSSD-Access-Provider filtert eine neu verschachtelte Gruppe aus', 'PAM-Session-Modul erstellt das Benutzerverzeichnis mit falschem Eigentümer', 'Kerberos-Keytab des SSSD-Hosts enthält nicht mehr den aktuellen Principal'],
  'Linux / Backup / Anwendungskonsistenz': ['LVM-Snapshot läuft vor dem Hook zum Pausieren der Datenbank ab', 'Backup-Agent sichert einen Bind-Mount statt des tatsächlichen Datenvolumes', 'Wiederherstellungspunkt enthält nicht den zugehörigen Transaktionslog-Stand'],
  'Linux / Container / Netzwerk': ['CNI-Subnetz überschneidet sich nach Änderung mit dem entfernten Standortnetz', 'Ingress-Controller hält nach Pod-Rotation einen veralteten Endpoint', 'Host-Firewall erlaubt Container-Egress, aber nicht den DNS-Rückverkehr'],
  'Kritischer Namens- und Dienstpfad': ['DNS-GSLB liefert einen ausgefallenen Standortknoten weiterhin aus', 'Resolverdelegation für eine gemeinsame Dienstzone verweist auf veraltete NS', 'Healthcheck prüft TCP-Port statt der Backend-Funktion und lässt defekten Knoten aktiv'],
  Identitätsplattform: ['Global Catalog eines Standorts liefert veraltete Gruppenmitgliedschaften', 'Token-Signing-Zertifikat ist auf nur einem STS-Knoten abgelaufen', 'OIDC-Discovery-Dokumente unterscheiden sich zwischen den Gateway-Knoten'],
  'Virtualisierung / Cluster': ['Cluster-Heartbeat-Netz ist als VM-Netz statt dediziertes VLAN gebunden', 'VM-Monitoring interpretiert einen kurzzeitigen Storage-Pause-Status als Hostausfall', 'HA-Agent nutzt nach Update einen nicht kompatiblen API-Endpunkt'],
  'Storage / Failover': ['SCSI-3-Reservation wird auf einem Initiator nach Failover nicht freigegeben', 'Replikationslink verwendet nach Netzumbau eine nicht geroutete Quelladresse', 'Write-Cache-Schutz eines Storage-Controllers meldet degradierte Batterie'],
  'Netzwerk / Sicherheitszonen': ['Firewall-Regel trifft wegen Objektgruppenreihenfolge auf ein falsches Präfix', 'NAT-Regel greift vor der Zonenpolicy und verändert den erwarteten Quellbereich', 'HA-Firewall synchronisiert Conntrack-Zustand nach Rollenwechsel nicht'],
  'Wiederanlauf / Backup-Steuerung': ['Recovery-Runbook referenziert ein umbenanntes Repository', 'Abhängiger DNS-Dienst wird im Orchestrierungsplan nach der Anwendung gestartet', 'automatische Freigabe erfolgt vor erfolgreicher Quorum- und Datenstandprüfung'],
};

function ingredients(level) {
  if (level === 1) return {
    triggers: ['seit dem letzten lokalen Neustart', 'nach Anschluss oder Wechsel eines Arbeitsplatzgeräts', 'seit einer lokalen Anwendungseinstellung geändert wurde', 'nach einer regulären lokalen Aktualisierung'],
    symptoms: ['ein einzelner Vorgang schlägt mit derselben lokalen Meldung fehl', 'eine Funktion reagiert anders als vor dem Gerätewechsel', 'die Anwendung startet, aber die betroffene lokale Funktion arbeitet nicht', 'das Gerät ist sichtbar, wird aber lokal nicht korrekt verwendet'],
    scopes: ['auf eine Person und ihren Arbeitsplatz begrenzt', 'auf ein lokales Gerät am Arbeitsplatz begrenzt', 'auf eine einzelne Anwendung oder Peripheriekette begrenzt'],
  };
  if (level === 2) return {
    triggers: ['nach einer regulären Dienstwartung', 'seit eine gemeinsame Gruppenberechtigung angepasst wurde', 'nach einer Aktualisierung der gemeinsam genutzten Ressource', 'seit einem Access-Point- oder Druckerwechsel'],
    symptoms: ['bestehende Sitzungen funktionieren, neue Vorgänge scheitern', 'nur ein Teil der Gruppe kann den gemeinsamen Dienst nicht nutzen', 'die Ressource ist sichtbar, aber die eigentliche Funktion schlägt fehl', 'Fehlerbild ist bei betroffenen Gruppenmitgliedern ähnlich'],
    scopes: ['auf einen Teil einer gemeinsamen Arbeitsgruppe begrenzt', 'auf eine gemeinsam genutzte Ressource begrenzt', 'auf mehrere Geräte in einem Arbeitsbereich begrenzt'],
  };
  const broad = ['nach einem regulären Wartungsfenster', 'nach einer planmäßigen Kennwort- oder Zertifikatsrotation', 'seit einer dokumentierten Gruppen- oder Standortänderung', 'nach einem kürzlichen Neustart oder Gerätewechsel'];
  return {
    triggers: level === 3 ? broad.map((value, i) => i === 2 ? 'seit einer dokumentierten Richtlinien- oder Gruppenänderung' : value) : broad,
    symptoms: ['Fehler tritt nur bei bestimmten Zugriffspfaden auf', 'bestehende Sitzungen funktionieren, neue Vorgänge scheitern', 'Fehler ist zeitweise und betrifft nicht alle gleichartigen Systeme', 'Erreichbarkeit besteht, die eigentliche Funktion schlägt dennoch fehl'],
    scopes: level === 3
      ? ['auf eine Teilmenge administrierter Clients begrenzt', 'auf eine Benutzergruppe oder einen Dienst begrenzt', 'zwischen zwei Domänencontrollern oder Teilnetzen unterschiedlich']
      : ['auf einen Teil einer gemeinsamen Gruppe begrenzt', 'zwischen Dienstknoten unterschiedlich', 'zwischen zwei Standorten oder Zugriffspfaden unterschiedlich'],
  };
}

function variantsFor(scenario) {
  const causes = HARDWARE_CAUSES[scenario.category] || [...(CAUSES[scenario.category] || []), ...(ADDITIONAL_CAUSES[scenario.category] || [])];
  if (causes.length < 6) throw new Error(`Unvollständiger Ursachen-Katalog für ${scenario.category}`);
  const { triggers, symptoms, scopes } = hardwareIngredients(scenario) || ingredients(scenario.level);
  const result = [];
  for (let i = 0; i < causes.length; i++) for (let t = 0; t < triggers.length; t++) for (let s = 0; s < symptoms.length; s++) for (let p = 0; p < scopes.length; p++) {
    const cause = causes[i], trigger = triggers[(t + i) % triggers.length], symptom = symptoms[(s + i) % symptoms.length], scope = scopes[(p + i) % scopes.length];
    const fingerprint = `${scenario.id}:${crypto.createHash('sha256').update([scenario.id, cause, trigger, symptom, scope].join('\0')).digest('hex')}`;
    result.push(Object.freeze({ id: `${scenario.id}:${i + 1}:${t}${s}${p}`, fingerprint, family: scenario.id, cause, trigger, symptom, scope }));
  }
  return result;
}

function variationsFor(scenario) { return variantsFor(scenario); }
function variantCount(scenario) { return variantsFor(scenario).length; }
module.exports = { variationsFor, variantCount };
