import QRCode from "qrcode";

/**
 * QR del check-in como data URL de un SVG, listo para un <img src>. Se genera
 * en el servidor al cargar la pantalla y una vez por minuto en el polling de
 * RotatingQR. En SVG cuesta ~0,3 ms de CPU contra ~30 ms del PNG de 720 px
 * que se usaba antes, pesa la mitad y se ve nítido a cualquier tamaño.
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
