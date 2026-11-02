import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Box3, Mesh, Vector3, type AnimationClip, type Object3D } from "three";
import { getAssetBase } from "./config.js";

/** Caminho completo de um arquivo da pasta de assets. */
export function assetUrl(file: string): string {
  return `${getAssetBase().replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}

export interface LoadedAsset {
  /** Cópia própria do modelo (pode haver várias instâncias do mesmo arquivo). */
  scene: Object3D;
  animations: AnimationClip[];
}

function useGlb(url: string): LoadedAsset {
  const gltf = useGLTF(url);
  // Clone por uso: o cache devolve SEMPRE a mesma cena; clonando, duas instâncias não brigam pelo mesmo pai.
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  return { scene, animations: gltf.animations };
}

function useFbx(url: string): LoadedAsset {
  const fbx = useLoader(FBXLoader, url);
  const scene = useMemo(() => cloneSkinned(fbx), [fbx]);
  // FBX costuma vir em centímetros (escala 100): normalize na hora de usar, se for o caso.
  return { scene, animations: fbx.animations };
}

/**
 * Carrega um arquivo pela extensão (`.glb`/`.gltf` ou `.fbx`) a partir da pasta de assets.
 * Suspende enquanto baixa — use dentro de <Suspense>.
 */
export function useAsset(file: string): LoadedAsset {
  const url = assetUrl(file);
  const isFbx = /\.fbx$/i.test(file);
  // O hook escolhido depende só da extensão (constante por arquivo), então a ordem dos hooks não muda entre renders.
  return isFbx ? useFbx(url) : useGlb(url);
}

/** Pré-carrega um arquivo (opcional) para entrar sem atraso. */
export function preloadAsset(file: string): void {
  if (!/\.fbx$/i.test(file)) useGLTF.preload(assetUrl(file));
}

interface AssetModelProps {
  file: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  scale?: number | [number, number, number];
  /** Esconde o desenho (útil para um modelo usado só como colisão). */
  visible?: boolean;
  /** Ajusta o modelo para esta altura (m), com os pés em y=0 e centrado em x/z. Útil para modelos em outra escala. */
  fitHeight?: number;
  /** Recebe a cena carregada (ex.: para ligar animações). */
  onLoaded?: (asset: LoadedAsset) => void;
}

/** Escala e posiciona a cena para ter `height` metros, pés em y=0, centrada em x/z (mede a caixa já com a escala 1). */
function fitToHeight(scene: Object3D, height: number): void {
  scene.scale.setScalar(1);
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  if (size.y <= 0) return;
  const k = height / size.y;
  scene.scale.setScalar(k);
  scene.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
}

function AssetModelInner({ file, castShadow = true, receiveShadow = true, scale = 1, visible = true, fitHeight, onLoaded }: AssetModelProps) {
  const asset = useAsset(file);
  useMemo(() => {
    if (fitHeight) fitToHeight(asset.scene, fitHeight);
  }, [asset, fitHeight]);
  useEffect(() => {
    asset.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = castShadow;
        o.receiveShadow = receiveShadow;
      }
    });
    onLoaded?.(asset);
  }, [asset, castShadow, receiveShadow, onLoaded]);
  return fitHeight ? <primitive object={asset.scene} visible={visible} /> : <primitive object={asset.scene} scale={scale} visible={visible} />;
}

/** Falha de carregamento (404, arquivo corrompido) não derruba a cena: mostra o `fallback`. */
class LoadBoundary extends Component<{ fallback: ReactNode; file: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn(`[prototype3d] não foi possível carregar "${this.props.file}":`, error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Modelo carregado sob demanda de `ASSET_BASE`, com Suspense e tratamento de erro. */
export function AssetModel(props: AssetModelProps & { fallback?: ReactNode }) {
  const { fallback = null, ...rest } = props;
  return (
    <LoadBoundary key={rest.file} file={rest.file} fallback={fallback}>
      <Suspense fallback={fallback}>
        <AssetModelInner {...rest} />
      </Suspense>
    </LoadBoundary>
  );
}
