import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  SHAPE_LABELS,
  curveSamples,
  initials,
  stageOf,
  type ChoreographyDocument,
  type Dancer,
  type Formation,
} from "@/lib/domain";
import { WING_WIDTH, resolvedStage } from "@/lib/geometry";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 32;

const INK = rgb(0.14, 0.11, 0.09);
const MUTED = rgb(0.43, 0.38, 0.33);
const STAGE_FILL = rgb(0.96, 0.93, 0.88);
const WING_FILL = rgb(0.9, 0.86, 0.8);
const GRID = rgb(0.78, 0.73, 0.66);
const STAGE_LINE = rgb(0.55, 0.4, 0.28);

function pdfSafe(font: PDFFont, value: string) {
  let out = "";
  for (const char of Array.from(value.normalize("NFC"))) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += "?";
    }
  }
  return out;
}

function fitText(font: PDFFont, value: string, size: number, maxWidth: number) {
  let text = pdfSafe(font, value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  while (text.length > 1 && font.widthOfTextAtSize(`${text}...`, size) > maxWidth) text = text.slice(0, -1);
  return `${text}...`;
}

function hexColor(value: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return rgb(0.4, 0.4, 0.4);
  const hex = Number.parseInt(match[1], 16);
  return rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

function fileName(title: string) {
  const cleaned = title
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${(cleaned || "choregraphie").slice(0, 80)}.pdf`;
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, centerX: number, y: number, size: number, color = INK) {
  const safe = pdfSafe(font, text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: centerX - width / 2, y, size, font, color });
}

export async function buildTableauxPdf(doc: ChoreographyDocument) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const stage = stageOf(doc);
  const resolved = resolvedStage(stage);
  const formations = doc.formations.slice().sort((a, b) => a.order - b.order);
  const dancers = doc.dancers.slice().sort((a, b) => a.order - b.order);
  const shapeLabel = `${SHAPE_LABELS[resolved.shape]}, ${resolved.width} × ${resolved.depth} m`;

  formations.forEach((formation, index) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const next = formations[index + 1];
    drawTableau(page, {
      regular,
      bold,
      doc,
      formation,
      next,
      dancers,
      shapeLabel,
      pageIndex: index,
      pageCount: formations.length,
      resolved,
    });
  });

  return pdf.save();
}

function drawTableau(
  page: PDFPage,
  input: {
    regular: PDFFont;
    bold: PDFFont;
    doc: ChoreographyDocument;
    formation: Formation;
    next: Formation | undefined;
    dancers: Dancer[];
    shapeLabel: string;
    pageIndex: number;
    pageCount: number;
    resolved: ReturnType<typeof resolvedStage>;
  },
) {
  const { regular, bold, doc, formation, next, dancers, shapeLabel, pageIndex, pageCount, resolved } = input;
  const title = fitText(bold, doc.title, 16, PAGE_W - MARGIN * 2);
  page.drawText(title, { x: MARGIN, y: PAGE_H - MARGIN - 4, size: 16, font: bold, color: INK });
  const detail = `${formation.label} · tenue ${formation.holdBeats} temps · déplacement ${formation.transitionBeats} temps · ${doc.tempoTpm} TPM · ${shapeLabel}`;
  page.drawText(fitText(regular, detail, 10, PAGE_W - MARGIN * 2), {
    x: MARGIN,
    y: PAGE_H - MARGIN - 22,
    size: 10,
    font: regular,
    color: MUTED,
  });

  const legend = layoutLegend(dancers, regular);
  const legendTop = 22 + legend.height;
  const headerBottom = PAGE_H - MARGIN - 36;
  const boxX = MARGIN;
  const boxY = legendTop + 8;
  const boxW = PAGE_W - MARGIN * 2;
  const boxH = headerBottom - boxY;

  const padX = 0.85;
  const minX = -resolved.width / 2 - WING_WIDTH - padX;
  const maxX = resolved.width / 2 + WING_WIDTH + padX;
  const minY = -resolved.depth / 2 - 1.35;
  const maxY = resolved.depth / 2 + 0.85;
  const scale = Math.min(boxW / (maxX - minX), boxH / (maxY - minY));
  const drawW = (maxX - minX) * scale;
  const drawH = (maxY - minY) * scale;
  const originX = boxX + (boxW - drawW) / 2;
  const originY = boxY + (boxH - drawH) / 2;
  const map = (x: number, y: number) => ({
    x: originX + (x - minX) * scale,
    y: originY + (y - minY) * scale,
  });

  const wingLeft = map(-resolved.width / 2 - WING_WIDTH, -resolved.depth / 2);
  const stageOrigin = map(-resolved.width / 2, -resolved.depth / 2);
  page.drawRectangle({
    x: wingLeft.x,
    y: wingLeft.y,
    width: WING_WIDTH * scale,
    height: resolved.depth * scale,
    color: WING_FILL,
  });
  page.drawRectangle({
    x: map(resolved.width / 2, -resolved.depth / 2).x,
    y: wingLeft.y,
    width: WING_WIDTH * scale,
    height: resolved.depth * scale,
    color: WING_FILL,
  });
  if (resolved.shape === "oval" || resolved.shape === "circle") {
    const center = map(0, 0);
    page.drawEllipse({
      x: center.x,
      y: center.y,
      xScale: (resolved.width / 2) * scale,
      yScale: (resolved.depth / 2) * scale,
      color: STAGE_FILL,
      borderColor: STAGE_LINE,
      borderWidth: 1.2,
    });
  } else if (resolved.shape === "semicircle") {
    const radius = (resolved.width / 2) * scale;
    const center = map(0, resolved.depth / 2);
    page.drawEllipse({
      x: center.x,
      y: center.y,
      xScale: radius,
      yScale: radius,
      color: STAGE_FILL,
      borderColor: STAGE_LINE,
      borderWidth: 1.2,
    });
    page.drawRectangle({
      x: center.x - radius - 1,
      y: center.y,
      width: radius * 2 + 2,
      height: radius + 2,
      color: rgb(1, 1, 1),
    });
    const left = map(-resolved.width / 2, resolved.depth / 2);
    const right = map(resolved.width / 2, resolved.depth / 2);
    page.drawLine({ start: left, end: right, thickness: 1.2, color: STAGE_LINE });
  } else {
    page.drawRectangle({
      x: stageOrigin.x,
      y: stageOrigin.y,
      width: resolved.width * scale,
      height: resolved.depth * scale,
      color: STAGE_FILL,
      borderColor: STAGE_LINE,
      borderWidth: 1.2,
    });
  }

  for (let x = Math.ceil(-resolved.width / 2); x <= Math.floor(resolved.width / 2); x += 1) {
    const from = map(x, -resolved.depth / 2);
    const to = map(x, resolved.depth / 2);
    page.drawLine({ start: from, end: to, thickness: x === 0 ? 0.8 : 0.35, color: GRID });
  }
  for (let y = Math.ceil(-resolved.depth / 2); y <= Math.floor(resolved.depth / 2); y += 1) {
    const from = map(-resolved.width / 2, y);
    const to = map(resolved.width / 2, y);
    page.drawLine({ start: from, end: to, thickness: y === 0 ? 0.8 : 0.35, color: GRID });
  }

  if (next) {
    for (const dancer of dancers) {
      const start = formation.positions.find((position) => position.dancerId === dancer.id);
      const end = next.positions.find((position) => position.dancerId === dancer.id);
      if (!start || !end) continue;
      const samples = curveSamples({ x: start.x, y: start.y }, { x: end.x, y: end.y }, start.curve ?? 0);
      const color = hexColor(dancer.color);
      for (let step = 0; step < samples.length - 1; step += 2) {
        const from = samples[step];
        const to = samples[step + 1];
        if (!from || !to) continue;
        page.drawLine({
          start: map(from.x, from.y),
          end: map(to.x, to.y),
          thickness: 1.5,
          color,
        });
      }
    }
  }

  const radiusMeters = Math.min(0.46, Math.max(0.22, Math.min(resolved.width, resolved.depth) / 16));
  const radius = Math.min(12, Math.max(7, radiusMeters * scale));
  for (const dancer of dancers) {
    const position = formation.positions.find((item) => item.dancerId === dancer.id);
    const point = position ? map(position.x, position.y) : map(0, 0);
    page.drawCircle({ x: point.x, y: point.y, size: radius, color: hexColor(dancer.color) });
    drawCentered(page, bold, initials(dancer.name), point.x, point.y - radius * 0.32, Math.max(6, radius * 0.72), rgb(1, 1, 1));
  }

  drawCentered(page, regular, "Coulisse", map(-resolved.width / 2 - WING_WIDTH / 2, resolved.depth / 2 - 0.4).x, map(0, resolved.depth / 2 - 0.4).y, 8, MUTED);
  drawCentered(page, regular, "Côté jardin", map(-resolved.width / 2 - WING_WIDTH / 2, resolved.depth / 2 - 0.85).x, map(0, resolved.depth / 2 - 0.85).y, 7, MUTED);
  drawCentered(page, regular, "Coulisse", map(resolved.width / 2 + WING_WIDTH / 2, resolved.depth / 2 - 0.4).x, map(0, resolved.depth / 2 - 0.4).y, 8, MUTED);
  drawCentered(page, regular, "Côté cours", map(resolved.width / 2 + WING_WIDTH / 2, resolved.depth / 2 - 0.85).x, map(0, resolved.depth / 2 - 0.85).y, 7, MUTED);
  drawCentered(page, regular, "Fond", map(0, resolved.depth / 2 - 0.4).x, map(0, resolved.depth / 2 - 0.4).y, 8, STAGE_LINE);
  drawCentered(page, regular, "Public", map(0, -resolved.depth / 2 - 0.55).x, map(0, -resolved.depth / 2 - 0.55).y, 9, STAGE_LINE);

  const scaleStart = map(minX + 0.25, minY + 0.35);
  page.drawLine({
    start: scaleStart,
    end: { x: scaleStart.x + scale, y: scaleStart.y },
    thickness: 1,
    color: STAGE_LINE,
  });
  drawCentered(page, regular, "1 m", scaleStart.x + scale / 2, scaleStart.y - 11, 8, MUTED);

  drawLegend(page, legend, regular);
  const footer = `${pageIndex + 1} / ${pageCount}`;
  const footerWidth = regular.widthOfTextAtSize(footer, 9);
  page.drawText(footer, { x: PAGE_W - MARGIN - footerWidth, y: 16, size: 9, font: regular, color: MUTED });
}

function layoutLegend(dancers: Dancer[], font: PDFFont) {
  const size = 9;
  const gap = 14;
  const maxWidth = PAGE_W - MARGIN * 2;
  const rows: { dancer: Dancer; x: number; y: number }[] = [];
  let x = MARGIN;
  let row = 0;
  for (const dancer of dancers) {
    const label = pdfSafe(font, dancer.name);
    const width = 12 + font.widthOfTextAtSize(label, size);
    if (x > MARGIN && x + width > MARGIN + maxWidth) {
      row += 1;
      x = MARGIN;
    }
    rows.push({ dancer, x, y: 28 + row * 16 });
    x += width + gap;
  }
  return { items: rows, height: 16 + row * 16 };
}

function drawLegend(page: PDFPage, legend: ReturnType<typeof layoutLegend>, font: PDFFont) {
  for (const item of legend.items) {
    page.drawCircle({ x: item.x + 4, y: item.y + 3, size: 4, color: hexColor(item.dancer.color) });
    page.drawText(pdfSafe(font, item.dancer.name), {
      x: item.x + 12,
      y: item.y,
      size: 9,
      font,
      color: INK,
    });
  }
}

export async function downloadTableauxPdf(doc: ChoreographyDocument) {
  const bytes = await buildTableauxPdf(doc);
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(doc.title);
  link.click();
  URL.revokeObjectURL(url);
}
