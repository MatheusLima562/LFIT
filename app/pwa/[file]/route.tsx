import { ImageResponse } from "next/og";
import { BRAND } from "@/features/brand/config";

const SIZES: Record<string, number> = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };

/** Ícones do PWA gerados a partir da marca (features/brand/config.ts: cores e o "L"); estáticos e públicos. */
export async function GET(_request: Request, { params }: RouteContext<"/pwa/[file]">) {
  const { file } = await params;
  const size = SIZES[file];
  if (!size) return new Response("Not found", { status: 404 });
  const stroke = Math.round(size * 0.1);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primaryDark})`,
        }}
      >
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={24 * (stroke / size) * 1.8} strokeLinecap="round" strokeLinejoin="round">
          {BRAND.logoPaths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}
