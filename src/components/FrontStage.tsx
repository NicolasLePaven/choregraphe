import { initials, type Dancer } from "@/lib/domain";
import { apparentOf, resolvedStage, WING_WIDTH, type Point, type Stage } from "@/lib/geometry";

type Props = {
  stage: Stage;
  dancers: Dancer[];
  positions: Map<string, Point>;
};

export function FrontStage({ stage, dancers, positions }: Props) {
  const resolved = resolvedStage(stage);
  const frontY = -resolved.depth / 2;
  const opening = apparentOf({ x: resolved.width / 2, y: frontY });
  const wing = apparentOf({ x: resolved.width / 2 + WING_WIDTH, y: frontY });
  const frontCenter = apparentOf({ x: 0, y: frontY });
  const openingHeight = frontCenter.h * 1.45;
  const padX = wing.x * 0.08;
  const minX = -wing.x - padX;
  const width = (wing.x + padX) * 2;
  const top = openingHeight * 1.12;
  const bottom = openingHeight * 0.16;
  const stroke = Math.max(openingHeight * 0.012, 0.001);

  const figures = dancers
    .map((dancer) => {
      const point = positions.get(dancer.id) ?? { x: 0, y: 0 };
      return { dancer, ...apparentOf(point) };
    })
    .sort((a, b) => b.D - a.D || a.dancer.order - b.dancer.order);

  return (
    <svg
      viewBox={`${minX} ${-top} ${width} ${top + bottom}`}
      className="h-full w-full rounded-2xl bg-[#161311]"
      role="img"
      aria-label="Scène vue de face depuis le spectateur"
    >
      <rect x={-wing.x} y={-openingHeight} width={wing.x - opening.x} height={openingHeight} fill="#2a2622" />
      <rect x={opening.x} y={-openingHeight} width={wing.x - opening.x} height={openingHeight} fill="#2a2622" />
      <rect
        x={-opening.x}
        y={-openingHeight}
        width={opening.x * 2}
        height={openingHeight}
        fill="#3c2c24"
        stroke="#e7c7a1"
        strokeWidth={stroke}
      />
      <line x1={-wing.x} x2={wing.x} y1={0} y2={0} stroke="#e7c7a1" strokeWidth={stroke} />
      {figures.map((figure) => {
        const cx = figure.x;
        const h = figure.h;
        const w = figure.w;
        const headR = h * 0.115;
        const neckY = -h + headR * 1.85;
        const shoulder = w * 0.5;
        const hip = w * 0.34;
        const hipY = -h * 0.46;
        const gap = w * 0.07;
        const leg = w * 0.2;
        const body = [
          `M ${cx - shoulder} ${neckY}`,
          `L ${cx + shoulder} ${neckY}`,
          `L ${cx + hip} ${hipY}`,
          `L ${cx + gap + leg} 0`,
          `L ${cx + gap} 0`,
          `L ${cx + gap * 0.15} ${hipY + h * 0.06}`,
          `L ${cx - gap * 0.15} ${hipY + h * 0.06}`,
          `L ${cx - gap} 0`,
          `L ${cx - gap - leg} 0`,
          `L ${cx - hip} ${hipY}`,
          "Z",
        ].join(" ");
        return (
          <g key={figure.dancer.id}>
            <path d={body} fill={figure.dancer.color} />
            <circle
              cx={cx}
              cy={-h + headR}
              r={headR}
              fill={figure.dancer.color}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={headR * 0.16}
            />
            <text
              x={cx}
              y={-h * 0.62}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={Math.min(h * 0.13, w * 0.55)}
              fontWeight={700}
            >
              {initials(figure.dancer.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
