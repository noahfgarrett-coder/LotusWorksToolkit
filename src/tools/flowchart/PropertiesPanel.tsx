import { useMemo } from 'react'
import type { FlowchartStore } from './flowchartStore.ts'
import type { DiagramNode, DiagramEdge, EdgeRouteType } from './types.ts'
import { ColorPicker } from '@/components/common/ColorPicker.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import {
  ArrowRight, Minus, MoreHorizontal,
  MoveUp, MoveDown,
} from 'lucide-react'

// ── Component ───────────────────────────────────────────────

export function PropertiesPanel({ store }: { store: FlowchartStore }) {
  const { nodes, edges, selection, updateNode, updateEdge, bringToFront, sendToBack } = store

  const selectedNodes = useMemo(
    () => nodes.filter(n => selection.nodeIds.has(n.id)),
    [nodes, selection.nodeIds],
  )

  const selectedEdges = useMemo(
    () => edges.filter(e => selection.edgeIds.has(e.id)),
    [edges, selection.edgeIds],
  )

  const totalSelected = selectedNodes.length + selectedEdges.length

  if (totalSelected === 0) {
    return (
      <div className="w-[240px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated p-4">
        <p className="text-[10px] text-white/25 text-center mt-8">
          Select an element to edit its properties
        </p>
      </div>
    )
  }

  return (
    <div className="w-[240px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated overflow-y-auto">
      <div className="px-3 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
        Properties
        <span className="text-white/20 ml-1">({totalSelected})</span>
      </div>

      <div className="p-3 space-y-4">
        {/* Node properties */}
        {selectedNodes.length > 0 && (
          <NodeProperties
            node={selectedNodes[0]}
            multipleSelected={selectedNodes.length > 1}
            updateNode={updateNode}
            bringToFront={bringToFront}
            sendToBack={sendToBack}
          />
        )}

        {/* Edge properties */}
        {selectedEdges.length > 0 && (
          <EdgeProperties
            edge={selectedEdges[0]}
            updateEdge={updateEdge}
          />
        )}
      </div>
    </div>
  )
}

// ── Node properties ─────────────────────────────────────────

function NodeProperties({
  node,
  multipleSelected,
  updateNode,
  bringToFront,
  sendToBack,
}: {
  node: DiagramNode
  multipleSelected: boolean
  updateNode: (id: string, updates: Partial<DiagramNode>) => void
  bringToFront: () => void
  sendToBack: () => void
}) {
  return (
    <>
      {/* Label */}
      {!multipleSelected && (
        <PropSection label="Label">
          <input
            type="text"
            value={node.label}
            onChange={e => updateNode(node.id, { label: e.target.value })}
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>
      )}

      {/* Fill */}
      <PropSection label="Fill Color">
        <ColorPicker
          value={node.style.fill}
          onChange={(color) => updateNode(node.id, {
            style: { ...node.style, fill: color },
          })}
        />
      </PropSection>

      {/* Stroke */}
      <PropSection label="Border Color">
        <ColorPicker
          value={node.style.stroke}
          onChange={(color) => updateNode(node.id, {
            style: { ...node.style, stroke: color },
          })}
        />
      </PropSection>

      {/* Border width */}
      <PropSection label="Border Width">
        <Slider
          value={node.style.strokeWidth}
          min={0}
          max={6}
          step={0.5}
          suffix="px"
          onChange={(e) => updateNode(node.id, {
            style: { ...node.style, strokeWidth: Number((e.target as HTMLInputElement).value) },
          })}
        />
      </PropSection>

      {/* Font size */}
      <PropSection label="Font Size">
        <Slider
          value={node.style.fontSize}
          min={8}
          max={24}
          step={1}
          suffix="px"
          onChange={(e) => updateNode(node.id, {
            style: { ...node.style, fontSize: Number((e.target as HTMLInputElement).value) },
          })}
        />
      </PropSection>

      {/* Font color */}
      <PropSection label="Text Color">
        <ColorPicker
          value={node.style.fontColor}
          onChange={(color) => updateNode(node.id, {
            style: { ...node.style, fontColor: color },
          })}
        />
      </PropSection>

      {/* Size */}
      {!multipleSelected && (
        <PropSection label="Size">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-white/30">W</label>
              <input
                type="number"
                value={Math.round(node.width)}
                min={40}
                onChange={e => updateNode(node.id, { width: Math.max(40, Number(e.target.value)) })}
                className="w-full px-1.5 py-1 text-[11px] bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40 tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-white/30">H</label>
              <input
                type="number"
                value={Math.round(node.height)}
                min={30}
                onChange={e => updateNode(node.id, { height: Math.max(30, Number(e.target.value)) })}
                className="w-full px-1.5 py-1 text-[11px] bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40 tabular-nums"
              />
            </div>
          </div>
        </PropSection>
      )}

      {/* Z-order */}
      <PropSection label="Layer Order">
        <div className="flex gap-1">
          <button
            onClick={bringToFront}
            title="Bring to Front"
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-white/50 bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors"
          >
            <MoveUp size={10} /> Front
          </button>
          <button
            onClick={sendToBack}
            title="Send to Back"
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-white/50 bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors"
          >
            <MoveDown size={10} /> Back
          </button>
        </div>
      </PropSection>
    </>
  )
}

// ── Edge properties ─────────────────────────────────────────

const ROUTE_TYPES: { value: EdgeRouteType; label: string; icon: typeof ArrowRight }[] = [
  { value: 'straight', label: 'Straight', icon: ArrowRight },
  { value: 'orthogonal', label: 'Right Angle', icon: Minus },
  { value: 'curved', label: 'Curved', icon: MoreHorizontal },
]

function EdgeProperties({
  edge,
  updateEdge,
}: {
  edge: DiagramEdge
  updateEdge: (id: string, updates: Partial<DiagramEdge>) => void
}) {
  return (
    <>
      {/* Label */}
      <PropSection label="Edge Label">
        <input
          type="text"
          value={edge.label}
          onChange={e => updateEdge(edge.id, { label: e.target.value })}
          placeholder="Optional label"
          className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
        />
      </PropSection>

      {/* Route type */}
      <PropSection label="Route Type">
        <div className="flex gap-1">
          {ROUTE_TYPES.map(rt => {
            const isActive = edge.routeType === rt.value
            return (
              <button
                key={rt.value}
                onClick={() => updateEdge(edge.id, { routeType: rt.value })}
                title={rt.label}
                className={`
                  flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors
                  ${isActive
                    ? 'bg-[#F47B20]/15 text-[#F47B20] font-medium'
                    : 'text-white/40 bg-white/[0.04] hover:bg-white/[0.08]'
                  }
                `}
              >
                <rt.icon size={10} />
                {rt.label}
              </button>
            )
          })}
        </div>
      </PropSection>

      {/* Stroke color */}
      <PropSection label="Line Color">
        <ColorPicker
          value={edge.style.stroke}
          onChange={(color) => updateEdge(edge.id, {
            style: { ...edge.style, stroke: color },
          })}
        />
      </PropSection>

      {/* Stroke width */}
      <PropSection label="Line Width">
        <Slider
          value={edge.style.strokeWidth}
          min={0.5}
          max={5}
          step={0.5}
          suffix="px"
          onChange={(e) => updateEdge(edge.id, {
            style: { ...edge.style, strokeWidth: Number((e.target as HTMLInputElement).value) },
          })}
        />
      </PropSection>

      {/* Dash style */}
      <PropSection label="Line Style">
        <div className="flex gap-1">
          {[
            { value: '', label: 'Solid' },
            { value: '6 3', label: 'Dashed' },
            { value: '2 2', label: 'Dotted' },
          ].map(style => {
            const isActive = edge.style.dashArray === style.value
            return (
              <button
                key={style.value}
                onClick={() => updateEdge(edge.id, {
                  style: { ...edge.style, dashArray: style.value },
                })}
                className={`
                  px-2 py-1 text-[10px] rounded transition-colors
                  ${isActive
                    ? 'bg-[#F47B20]/15 text-[#F47B20] font-medium'
                    : 'text-white/40 bg-white/[0.04] hover:bg-white/[0.08]'
                  }
                `}
              >
                {style.label}
              </button>
            )
          })}
        </div>
      </PropSection>

      {/* Arrowhead */}
      <PropSection label="Arrow">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={edge.style.markerEnd}
            onChange={e => updateEdge(edge.id, {
              style: { ...edge.style, markerEnd: e.target.checked },
            })}
            className="rounded border-white/20 bg-dark-surface text-[#F47B20] focus:ring-[#F47B20]/40"
          />
          <span className="text-xs text-white/60">Show arrowhead</span>
        </label>
      </PropSection>
    </>
  )
}

// ── Shared section wrapper ──────────────────────────────────

function PropSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
      {children}
    </div>
  )
}
