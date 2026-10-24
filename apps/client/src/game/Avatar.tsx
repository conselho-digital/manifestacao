import { forwardRef, Suspense, useRef } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { VEHICLES, flagColor, type CharacterId, type FlagId, type TeamId, type VehicleId } from "@manifestacao/shared";
import { lookOf } from "./characterLook.js";
import { WHEELIE_MAX_ANGLE } from "./driving.js";
import { Flag3D, Vehicle3D, GlbModel } from "./props3d.js";
import { teamImageUrl } from "./models.js";
import { HIP_HEIGHT, fallBody, fallSeconds, reactBody, reactProgress, type KnockRefs } from "./knock.js";
import { CARRY_LEFT, CARRY_RIGHT, activeStrike, punchPose, flagTilt, handPosition, strikeArms, strikeEnvelope, type StrikeRefs } from "./strike.js";
import { SignProp } from "./SignProp.js";
import type { SignData } from "./useSigns.js";

interface AvatarProps {
  /** Cor da camisa/time (0xrrggbb). */
  color: number;
  name?: string;
  flag?: FlagId;
  /** Equipe: a imagem da bandeira da equipe (enviada no admin) é a bandeira que o personagem carrega a pé. */
  team?: TeamId;
  /** Personagem: define a aparência do corpo geométrico (cabelo, chapéu, tamanho). */
  character?: CharacterId;
  vehicle?: VehicleId;
  /** Cartaz personalizado ativo (texto vem do banco, nunca direto da rede). */
  sign?: SignData | null;
  /** URL de um modelo glTF; se ausente, usa o avatar geométrico. */
  modelUrl?: string | null;
  /** Quanto a moto está empinada (0..1), lido a cada frame (sem re-render). */
  wheelieRef?: { current: number };
  /** Início (performance.now) do golpe com a bandeira em andamento; 0 = nenhum. Lido a cada frame. */
  hitRef?: StrikeRefs;
  /** Reação a golpe e queda (o corpo recua, ou cai para trás, fica deitado e levanta). */
  knock?: KnockRefs;
}

const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;
/** Onde fica a mão que segura a haste (altura, à frente): a haste passa por aqui. */
const CARRY_HAND = handPosition(CARRY_LEFT.arm, CARRY_LEFT.forearm);

/** Eixo traseiro da moto: a roda da frente sobe girando em torno daqui. */
const MOTO_REAR_AXLE_Z = -0.7;

/** Cabelo/chapéu do personagem, sobre a cabeça (centro em y=1,7; frente = +Z). */
function Headwear({ character }: { character?: CharacterId }) {
  const look = lookOf(character);
  const mat = <meshStandardMaterial color={look.hairColor} />;
  switch (look.hair) {
    case "short":
      return (
        <mesh position={[0, 1.83, -0.02]} scale={[1, 0.62, 1]} castShadow>
          <sphereGeometry args={[0.3, 14, 10]} />
          {mat}
        </mesh>
      );
    case "mohawk":
      return (
        <group>
          {[-0.16, -0.05, 0.06, 0.17].map((z, i) => (
            <mesh key={z} position={[0, 1.96 + (i % 2) * 0.05, z]} castShadow>
              <boxGeometry args={[0.07, 0.22, 0.09]} />
              {mat}
            </mesh>
          ))}
        </group>
      );
    case "long":
      return (
        <group>
          <mesh position={[0, 1.83, -0.02]} scale={[1, 0.62, 1]} castShadow>
            <sphereGeometry args={[0.3, 14, 10]} />
            {mat}
          </mesh>
          <mesh position={[0, 1.48, -0.2]} castShadow>
            <boxGeometry args={[0.52, 0.62, 0.12]} />
            {mat}
          </mesh>
        </group>
      );
    case "bob":
      return (
        <mesh position={[0, 1.76, -0.03]} scale={[1, 0.85, 1.02]} castShadow>
          <sphereGeometry args={[0.33, 14, 12]} />
          {mat}
        </mesh>
      );
    case "pigtails":
      return (
        <group>
          <mesh position={[0, 1.83, -0.02]} scale={[1, 0.62, 1]} castShadow>
            <sphereGeometry args={[0.3, 14, 10]} />
            {mat}
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.34, 1.62, -0.05]} castShadow>
              <sphereGeometry args={[0.12, 10, 10]} />
              {mat}
            </mesh>
          ))}
        </group>
      );
    case "cap":
    case "police":
      return (
        <group>
          <mesh position={[0, 1.76, 0]} castShadow>
            <sphereGeometry args={[0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat}
          </mesh>
          <mesh position={[0, 1.77, 0.27]} castShadow>
            <boxGeometry args={[0.34, 0.03, 0.22]} />
            {mat}
          </mesh>
          {look.hair === "police" && (
            <mesh position={[0, 1.86, 0.3]}>
              <boxGeometry args={[0.1, 0.1, 0.02]} />
              <meshStandardMaterial color={0xe8c24a} />
            </mesh>
          )}
        </group>
      );
  }
}

/** Corpo geométrico (fallback quando não há modelo glTF). */
export function ProceduralBody({
  color,
  arms = true,
  character,
  riding = false,
  hitRef,
  carry = false,
}: {
  color: number;
  arms?: boolean;
  character?: CharacterId;
  riding?: boolean;
  hitRef?: StrikeRefs;
  carry?: boolean;
}) {
  const look = lookOf(character);
  const armRefs = useRef<(Group | null)[]>([null, null]);
  // Braços do boneco geométrico: segurando a bandeira, golpe de bandeira e soco.
  useFrame(() => {
    const st = activeStrike(hitRef);
    armRefs.current.forEach((g, i) => {
      if (!g) return;
      const isLeft = i === 1;
      let a = riding ? 1.05 : carry ? (isLeft ? CARRY_LEFT.arm : CARRY_RIGHT.arm) : 0.16;
      if (st) {
        const env = strikeEnvelope(st.p);
        if (st.kind === "flag") a = lerpN(a, strikeArms(st.p).arm * (isLeft ? 1 : 0.6), env);
        else {
          const pp = punchPose(st.p);
          a = lerpN(a, isLeft ? pp.lArm : pp.rArm, env);
        }
      }
      g.rotation.x = -a; // para a frente = rotação negativa em X
    });
  });
  return (
    // De piloto: o corpo desce até o banco e se inclina para a frente; os braços vão ao guidão.
    <group scale={look.scale} position={riding ? [0, -0.1, -0.32] : undefined} rotation={riding ? [0.38, 0, 0] : undefined}>
      {/* Braços: manga na cor da camisa e mão na cor da pele, caindo dos ombros com leve abertura. */}
      {arms && [-1, 1].map((side) => (
        <group key={side} ref={(g) => (armRefs.current[side < 0 ? 0 : 1] = g)} position={[side * 0.46, 1.32, 0]} rotation={riding ? [-1.05, 0, side * 0.12] : [0, 0, side * 0.12]}>
          {/* Braço dobrado no cotovelo: parado, os antebraços ficam levemente à frente, não esticados. */}
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.105, 0.2, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <group position={[0, -0.4, 0]} rotation={[riding ? -0.3 : carry ? -0.7 : -0.5, 0, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.2, 4, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -0.42, 0]} castShadow>
              <sphereGeometry args={[0.1, 10, 10]} />
              <meshStandardMaterial color={0xf2d2b6} />
            </mesh>
          </group>
        </group>
      ))}
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.8, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color={0xf2d2b6} />
      </mesh>
      {/* Rosto: olhos e sorriso, na frente (+Z) da cabeça */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.095, 1.73, 0.25]}>
          <sphereGeometry args={[0.032, 8, 8]} />
          <meshStandardMaterial color={0x1b1b1f} />
        </mesh>
      ))}
      <mesh position={[0, 1.63, 0.26]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.06, 0.012, 6, 12, Math.PI]} />
        <meshStandardMaterial color={0x8a3b32} />
      </mesh>
      <Headwear character={character} />
      {look.belt && (
        <mesh position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.37, 0.37, 0.09, 16]} />
          <meshStandardMaterial color={0x15181d} />
        </mesh>
      )}
    </group>
  );
}

/** Bandeira da equipe: o tecido leva a imagem enviada no admin (Equipes); sem imagem, a cor da equipe. */
function FlagProp({ flag, color, team }: { flag: FlagId; color: number; team?: TeamId }) {
  return <Flag3D color={flagColor(flag, color)} imageUrl={teamImageUrl(team)} />;
}

/**
 * Avatar: corpo (modelo glTF CC0 ou geométrico), bandeira opcional, veículo
 * opcional e etiqueta de apelido. Usado pelo jogador local e pelos remotos.
 */
export const Avatar = forwardRef<Group, AvatarProps>(function Avatar(
  { color, name, flag = "nenhuma", team, character, vehicle = "nenhum", sign = null, modelUrl = null, wheelieRef, hitRef, knock },
  ref,
) {
  const tiltRef = useRef<Group>(null);
  const flagPivotRef = useRef<Group>(null);
  const knockGroupRef = useRef<Group>(null);
  const kind = VEHICLES[vehicle]?.kind ?? "foot";
  const isMoto = kind === "moto";
  const hideBody = kind !== "foot" && kind !== "moto";
  // Empinar: inclina corpo + moto em torno do eixo traseiro (frente +Z sobe com rotação negativa em X).
  useFrame(() => {
    const g = tiltRef.current;
    if (!g) return;
    const target = isMoto ? -(wheelieRef?.current ?? 0) * WHEELIE_MAX_ANGLE : 0;
    g.rotation.x += (target - g.rotation.x) * 0.35;
    // Levar golpe: recuo. Queda: cai para trás em torno dos pés, fica deitado e levanta (3,4 s).
    const kg = knockGroupRef.current;
    if (kg) {
      const fs = knock ? fallSeconds(knock.fallAt.current) : -1;
      const rp = knock ? reactProgress(knock.reactAt.current) : -1;
      if (fs >= 0) {
        // Gira em torno do quadril (P): posição = P − R·P − descida; os pés escorregam para a frente e a cabeça vai para trás.
        const b = fallBody(fs);
        kg.rotation.x = b.tilt;
        kg.position.set(0, HIP_HEIGHT - HIP_HEIGHT * Math.cos(b.tilt) - b.drop, -HIP_HEIGHT * Math.sin(b.tilt));
      } else if (rp >= 0) {
        const b = reactBody(rp);
        kg.rotation.x = b.tilt;
        kg.position.set(0, 0, b.back);
      } else {
        kg.rotation.x = 0;
        kg.position.set(0, 0, 0);
      }
    }
    // Golpe com a bandeira: ela gira em torno da mão, que acompanha o braço.
    const pivot = flagPivotRef.current;
    if (pivot) {
      const st = activeStrike(hitRef);
      const flagStrike = st && st.kind === "flag" ? st : null;
      const env = flagStrike ? strikeEnvelope(flagStrike.p) : 0;
      const arms = flagStrike ? strikeArms(flagStrike.p) : CARRY_LEFT;
      const hand = handPosition(lerpN(CARRY_LEFT.arm, arms.arm, env), lerpN(CARRY_LEFT.forearm, arms.forearm, env));
      pivot.position.set(0, hand.y, hand.z);
      pivot.rotation.x = flagStrike ? flagTilt(flagStrike.p) * env : 0;
    }
  });
  return (
    <group ref={ref}>
      <group ref={knockGroupRef}>
      <group ref={tiltRef} position={[0, 0, MOTO_REAR_AXLE_Z]}>
      <group position={[0, 0, -MOTO_REAR_AXLE_Z]}>
      {/* Moto: o personagem vai sentado de piloto. Carro, caminhão e carro de som: só o veículo aparece. */}
      {!hideBody &&
        (modelUrl ? (
          <Suspense fallback={<ProceduralBody color={color} arms riding={isMoto} character={character} hitRef={hitRef} carry={flag !== "nenhuma" && vehicle === "nenhum"} />}>
            <GlbModel
              url={modelUrl}
              animated
              walking={vehicle === "nenhum"}
              pose={isMoto ? "moto" : null}
              strike={hitRef}
              knock={knock}
              carry={flag !== "nenhuma" && vehicle === "nenhum"}
              fallback={<ProceduralBody color={color} arms riding={isMoto} character={character} />}
            />
          </Suspense>
        ) : (
          <ProceduralBody color={color} arms={vehicle === "nenhum" || isMoto} riding={isMoto} character={character} hitRef={hitRef} carry={flag !== "nenhuma" && vehicle === "nenhum"} />
        ))}

      {/* Bandeira só a pé: em veículo as mãos estão ocupadas. */}
      {flag !== "nenhuma" && vehicle === "nenhum" && (
        <group ref={flagPivotRef} position={[0, CARRY_HAND.y, CARRY_HAND.z]}>
          <group position={[-0.13, -CARRY_HAND.y, 0]}>
            <FlagProp flag={flag} color={color} team={team} />
          </group>
        </group>
      )}
      {sign && !hideBody && <SignProp sign={sign} />}
      <Vehicle3D vehicle={vehicle} />
      </group>
      </group>

      {name && (
        <Html
          position={[0, sign ? 3.2 : 2.2, 0]}
          center
          distanceFactor={14}
          // Sem `occlude`: ele lança um raio contra a cena inteira por etiqueta a cada frame (pesa com muita gente).
          // O padrão do drei é um z-index enorme, que passava por cima de loja/opções.
          zIndexRange={[3, 0]}
          className="avatar-name"
          style={{
            pointerEvents: "none",
            whiteSpace: "nowrap",
            fontSize: "12px",
            fontWeight: 700,
            color: "#f5f6f7",
            textShadow: "0 1px 2px #000",
          }}
        >
          {name}
        </Html>
      )}
      </group>
    </group>
  );
});
