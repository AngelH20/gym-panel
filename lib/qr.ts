import QRCode from "qrcode";

/**
 * QR del check-in como data URL de un SVG, listo para un <img src>. Se genera
 * en el servidor en cada carga y cada ~30 s por el polling de RotatingQR: en
 * SVG cuesta ~0,3 ms de CPU contra ~30 ms del PNG de 720px que usábamos (que
 * en Cloudflare Workers solo ya pasaba el límite del plan), pesa un tercio y
 * se ve nítido a cualquier tamaño.
 */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#16191A", light: "#FBFBFA" },
    errorCorrectionLevel: "M",
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
