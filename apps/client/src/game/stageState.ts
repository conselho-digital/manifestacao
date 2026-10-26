/**
 * Em que círculo de escuta de palanque o jogador está (−1 = nenhum). Quem está dentro ouve só o palanque: o outdoor
 * fica mudo (ver ParkScreen). Atualizado por net/useStageVoice; lido a cada frame, sem re-render.
 */
let hearing = -1;
export function setStageHearing(stage: number): void {
  hearing = stage;
}
export function isInStageCircle(): boolean {
  return hearing >= 0;
}
