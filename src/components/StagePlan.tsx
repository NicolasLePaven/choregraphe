"use client";

import { useRef } from "react";
import { curveFromPointer, initials, pointOnCurve, type Dancer } from "@/lib/domain";
import {
  clampToValid,
  resolvedStage,
  WING_WIDTH,
  type Point,
  type Stage,
} from "@/lib/geometry";

export type TravelPath = {
  dancerId: string;
  color: string;
  from: Point;
  to: Point;
  curve: number;
  samples: Point[];
};

type Props = {
  stage: Stage;
  dancers: Dancer[];
  positions: Map<string, Point>;
  selectedId: string | null;
  editable: boolean;
  travels?: TravelPath[];
  curveIds?: string[];
  onSelect: (id: string) => void;
  onMove: (id: string, point: Point) => void;
  onCurve: (dancerId: string, curve: number) => void;
};

export function StagePlan({ stage, dancers, positions, selectedId, editable, travels = [], curveIds = [], onSelect, onMove, onCurve }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragId = useRef<string | null>(null);
  const dragKind = useRef<"dancer" | "curve" | null>(null);
  const resolved = resolvedStage(stage);
  const padX = 0.85;
  const minX = -resolved.width / 2 - WING_WIDTH - padX;
  const maxX = resolved.width / 2 + WING_WIDTH + padX;
  const minY = -resolved.depth / 2 - 1.2;
  const maxY = resolved.depth / 2 + 0.75;
  const sy = (y: number) => -y;
  const radius = Math.min(0.46, Math.max(0.22, Math.min(resolved.width, resolved.depth) / 16));

  function clientToStage(event: React.PointerEvent<SVGSVGElement>): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: -local.y };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!editable) return;
    if (dragKind.current === "curve") {
      const travel = travels.find((item) => item.dancerId === dragId.current);
      if (!travel) return;
      onCurve(travel.dancerId, curveFromPointer(travel.from, travel.to, clientToStage(event)));
      return;
    }
    if (!dragId.current) return;
    onMove(dragId.current, clampToValid(clientToStage(event), stage));
  }

  function endDrag() {
    dragId.current = null;
    dragKind.current = null;
  }

  const verticals: number[] = [];
  for (let x = Math.ceil(minX); x <= Math.floor(maxX); x += 1) verticals.push(x);
  const horizontals: number[] = [];
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y += 1) horizontals.push(y);

  const ordered = dancers.slice().sort((a, b) => a.order - b.order);
  const selected = ordered.filter((dancer) => dancer.id === selectedId);
  const others = ordered.filter((dancer) => dancer.id !== selectedId);

  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`}
      className="h-full w-full touch-none rounded-2xl bg-[#161311]"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <rect
        x={-resolved.width / 2 - WING_WIDTH}
        y={sy(resolved.depth / 2)}
        width={WING_WIDTH}
        height={resolved.depth}
        fill="#2a2622"
      />
      <rect
        x={resolved.width / 2}
        y={sy(resolved.depth / 2)}
        width={WING_WIDTH}
        height={resolved.depth}
        fill="#2a2622"
      />
      <rect
        x={-resolved.width / 2}
        y={sy(resolved.depth / 2)}
        width={resolved.width}
        height={resolved.depth}
        fill="#211c19"
      />
      {resolved.shape === "oval" || resolved.shape === "circle" ? (
        <ellipse cx={0} cy={0} rx={resolved.width / 2} ry={resolved.depth / 2} fill="#3c2c24" stroke="#e7c7a1" strokeWidth={0.06} />
      ) : (
        <rect
          x={-resolved.width / 2}
          y={sy(resolved.depth / 2)}
          width={resolved.width}
          height={resolved.depth}
          fill="#3c2c24"
          stroke="#e7c7a1"
          strokeWidth={0.06}
        />
      )}
      {verticals.map((x) => (
        <line key={`x-${x}`} x1={x} x2={x} y1={sy(resolved.depth / 2)} y2={sy(-resolved.depth / 2)} stroke="rgba(255,244,230,0.12)" strokeWidth={x === 0 ? 0.045 : 0.02} />
      ))}
      {horizontals.map((y) => (
        <line key={`y-${y}`} y1={sy(y)} y2={sy(y)} x1={-resolved.width / 2} x2={resolved.width / 2} stroke="rgba(255,244,230,0.12)" strokeWidth={y === 0 ? 0.045 : 0.02} />
      ))}
      <text x={-resolved.width / 2 - WING_WIDTH / 2} y={sy(resolved.depth / 2 - 0.35)} textAnchor="middle" fill="#d9cbbd" fontSize={0.32}>
        Coulisse
      </text>
      <text x={-resolved.width / 2 - WING_WIDTH / 2} y={sy(resolved.depth / 2 - 0.78)} textAnchor="middle" fill="#d9cbbd" fontSize={0.26}>
        Côté jardin
      </text>
      <text x={resolved.width / 2 + WING_WIDTH / 2} y={sy(resolved.depth / 2 - 0.35)} textAnchor="middle" fill="#d9cbbd" fontSize={0.32}>
        Coulisse
      </text>
      <text x={resolved.width / 2 + WING_WIDTH / 2} y={sy(resolved.depth / 2 - 0.78)} textAnchor="middle" fill="#d9cbbd" fontSize={0.26}>
        Côté cours
      </text>
      <text x={0} y={sy(resolved.depth / 2 - 0.28)} textAnchor="middle" fill="#e7c7a1" fontSize={0.32}>
        Fond
      </text>
      <text x={0} y={sy(-resolved.depth / 2 - 0.45)} textAnchor="middle" fill="#e7c7a1" fontSize={0.34}>
        Public
      </text>
      <line x1={minX + 0.2} x2={minX + 1.2} y1={sy(minY + 0.35)} y2={sy(minY + 0.35)} stroke="#e7c7a1" strokeWidth={0.04} />
      <text x={minX + 0.7} y={sy(minY + 0.12)} textAnchor="middle" fill="#e7c7a1" fontSize={0.28}>
        1 m
      </text>
      {travels.map((travel) => {
        const active = travel.dancerId === selectedId || curveIds.includes(travel.dancerId);
        return (
          <polyline
            key={`path-${travel.dancerId}`}
            points={travel.samples.map((point) => `${point.x},${sy(point.y)}`).join(" ")}
            fill="none"
            stroke={travel.color}
            strokeOpacity={active ? 0.95 : 0.45}
            strokeWidth={active ? 0.07 : 0.035}
            strokeDasharray="0.16 0.1"
            pointerEvents="none"
          />
        );
      })}
      {[...others, ...selected].map((dancer) => {
        const point = positions.get(dancer.id) ?? { x: 0, y: 0 };
        const active = dancer.id === selectedId;
        return (
          <g key={dancer.id} transform={`translate(${point.x} ${sy(point.y)})`}>
            <circle
              r={radius}
              fill={dancer.color}
              stroke={active ? "#fffaf3" : "rgba(0,0,0,0.35)"}
              strokeWidth={active ? 0.07 : 0.03}
              role="button"
              aria-label={dancer.name}
              style={{ cursor: editable ? "grab" : "pointer" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(dancer.id);
                if (!editable || !svgRef.current) return;
                dragKind.current = "dancer";
                dragId.current = dancer.id;
                svgRef.current.setPointerCapture(event.pointerId);
              }}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={radius * 0.78}
              fontWeight={700}
              pointerEvents="none"
            >
              {initials(dancer.name)}
            </text>
          </g>
        );
      })}
      {editable
        ? travels
            .filter((travel) => curveIds.includes(travel.dancerId))
            .map((travel) => {
              const handle = pointOnCurve(travel.from, travel.to, travel.curve, 0.5);
              const dancer = dancers.find((item) => item.id === travel.dancerId);
              return (
                <circle
                  key={`curve-${travel.dancerId}`}
                  cx={handle.x}
                  cy={sy(handle.y)}
                  r={Math.max(0.28, radius * 0.72)}
                  fill="#fffaf3"
                  stroke={travel.color}
                  strokeWidth={0.06}
                  role="button"
                  aria-label={dancer ? `Courbure de ${dancer.name}` : "Courbure du déplacement"}
                  style={{ cursor: "grab" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (!svgRef.current) return;
                    dragKind.current = "curve";
                    dragId.current = travel.dancerId;
                    svgRef.current.setPointerCapture(event.pointerId);
                  }}
                />
              );
            })
        : null}
    </svg>
  );
}
