import { useEffect, useState } from "react";
import { readPickedFile } from "../net/userImages.js";

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

/** Escolher uma imagem para o anúncio (opcional: vale texto, imagem, ou os dois). A conversão e o envio são no clique de enviar. */
export function AdImagePicker({
  file,
  onChange,
  onError,
  disabled = false,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ ...btn, opacity: disabled ? 0.5 : 1 }}>
          {file ? "Trocar imagem" : "Enviar imagem (opcional)"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            style={{ display: "none" }}
            onChange={(e) => {
              const input = e.target;
              const f = input.files?.[0];
              if (!f) return;
              void readPickedFile(f)
                .then((copy) => onChange(copy))
                .catch((err: unknown) => onError(err instanceof Error ? err.message : "Falha ao ler o arquivo."))
                .finally(() => {
                  input.value = "";
                });
            }}
          />
        </label>
        {file && (
          <button type="button" disabled={disabled} onClick={() => onChange(null)} style={btn}>
            Tirar imagem
          </button>
        )}
      </div>
      {preview && <img src={preview} alt="Imagem escolhida" style={{ maxHeight: 140, maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start", borderRadius: 6, border: "1px solid var(--line)" }} />}
    </div>
  );
}

/** "No ar até 14:32" a partir do fim das 12 h; vazio se não há prazo. */
export function untilLabel(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
