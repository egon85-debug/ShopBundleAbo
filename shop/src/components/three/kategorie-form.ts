/**
 * Zuordnung Kategoriename → raeumliche Form.
 *
 * Steht bewusst in einer eigenen Datei ohne Three.js-Bezug: die Seite braucht
 * nur diese Funktion, nicht die Szene. Laege sie neben der Szene, zoege der
 * Import die gesamte 3D-Ebene ins Seitenbundle – der dynamische Import waere
 * dann wirkungslos.
 */
export type Kategorieform = "karton" | "box" | "zubehoer";

export function formFuerKategorie(name: string): Kategorieform {
  const n = name.toLowerCase();
  if (n.includes("lager") || n.includes("box") || n.includes("behält") || n.includes("regal")) return "box";
  if (n.includes("zubehör") || n.includes("zubehoer") || n.includes("versand") || n.includes("etikett"))
    return "zubehoer";
  return "karton";
}
