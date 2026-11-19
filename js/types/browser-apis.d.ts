/** Déclarations des API chargées dynamiquement ou absentes de lib.dom. Aucun code exécuté. */
interface Navigator {
  /** Web Bluetooth est fourni par les navigateurs compatibles, hors définition DOM standard. */
  readonly bluetooth?: any;
}
interface Window {
  /** Bibliothèque SheetJS chargée à la demande depuis un script externe. */
  XLSX?: any;
}
/** Alias global exposé par le script SheetJS. */
declare var XLSX: any;
