/**
 * Mapas jogáveis. Cada mapa tem o próprio canal Realtime (quem está num mapa não aparece no outro) e o próprio cenário
 * no cliente (apps/client/src/game). O mapa padrão é a avenida original.
 */

export type MapId = "avenida" | "paulista";

export interface GameMap {
  id: MapId;
  label: string;
  description: string;
}

export const MAPS: Record<MapId, GameMap> = {
  avenida: {
    id: "avenida",
    label: "Avenida original",
    description: "Avenida longa com praça, parque e quarteirões de prédios. Tem palanque com voz e telões.",
  },
  paulista: {
    id: "paulista",
    label: "Av. Paulista",
    description: "Trecho real da Av. Paulista, com ruas e prédios do OpenStreetMap nas alturas reais.",
  },
};

export const MAP_IDS: MapId[] = ["avenida", "paulista"];
export const DEFAULT_MAP: MapId = "avenida";

export function isMapId(v: unknown): v is MapId {
  return typeof v === "string" && Object.hasOwn(MAPS, v);
}

/** Canal Realtime do mapa. O da avenida original mantém o nome antigo ("avenue"). */
export function channelNameFor(map: MapId): string {
  return map === "avenida" ? "avenue" : `avenue:${map}`;
}
