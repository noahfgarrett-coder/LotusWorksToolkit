import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/common/Button.tsx'
import { downloadBlob } from '@/utils/download.ts'
import { Download, Plus, Trash2, RotateCcw } from 'lucide-react'

interface OrgNode {
  id: string
  name: string
  title: string
  reportsTo: string // parent id or '' for root
}

interface LayoutNode extends OrgNode {
  x: number
  y: number
  children: LayoutNode[]
}

const NODE_WIDTH = 160
const NODE_HEIGHT = 60
const H_SPACING = 24
const V_SPACING = 60

function genId() {
  return Math.random().toString(36).substring(2, 11)
}

export default function OrgChartTool() {
  const [nodes, setNodes] = useState<OrgNode[]>([
    { id: 'root', name: 'CEO', title: 'Chief Executive Officer', reportsTo: '' },
  ])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const addNode = (parentId: string) => {
    const newNode: OrgNode = {
      id: genId(),
      name: 'New Person',
      title: 'Title',
      reportsTo: parentId,
    }
    setNodes((prev) => [...prev, newNode])
  }

  const removeNode = (id: string) => {
    // Remove node and all descendants
    const toRemove = new Set<string>()
    const collect = (nodeId: string) => {
      toRemove.add(nodeId)
      nodes.filter((n) => n.reportsTo === nodeId).forEach((n) => collect(n.id))
    }
    collect(id)
    setNodes((prev) => prev.filter((n) => !toRemove.has(n.id)))
  }

  const updateNode = (id: string, updates: Partial<OrgNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)))
  }

  // Build tree layout
  const buildTree = useCallback((): LayoutNode | null => {
    const root = nodes.find((n) => !n.reportsTo)
    if (!root) return null

    const buildSubtree = (node: OrgNode): LayoutNode => {
      const children = nodes
        .filter((n) => n.reportsTo === node.id)
        .map(buildSubtree)
      return { ...node, x: 0, y: 0, children }
    }

    const tree = buildSubtree(root)

    // Assign positions using simple top-down layout
    const layoutTree = (node: LayoutNode, depth: number, offsetX: number): number => {
      node.y = depth * (NODE_HEIGHT + V_SPACING)

      if (node.children.length === 0) {
        node.x = offsetX
        return NODE_WIDTH + H_SPACING
      }

      let totalWidth = 0
      let x = offsetX
      for (const child of node.children) {
        const childWidth = layoutTree(child, depth + 1, x)
        x += childWidth
        totalWidth += childWidth
      }

      // Center parent above children
      const firstChild = node.children[0]
      const lastChild = node.children[node.children.length - 1]
      node.x = (firstChild.x + lastChild.x) / 2

      return totalWidth
    }

    layoutTree(tree, 0, 0)
    return tree
  }, [nodes])

  // Render chart to canvas
  useEffect(() => {
    const tree = buildTree()
    if (!tree || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, maxY = 0
    const traverse = (node: LayoutNode) => {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x + NODE_WIDTH)
      maxY = Math.max(maxY, node.y + NODE_HEIGHT)
      node.children.forEach(traverse)
    }
    traverse(tree)

    const padding = 40
    canvas.width = (maxX - minX) + padding * 2
    canvas.height = maxY + padding * 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Translate so tree starts at padding
    const offsetX = padding - minX
    const offsetY = padding

    // Draw connectors
    const drawConnectors = (node: LayoutNode) => {
      for (const child of node.children) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1.5
        const parentCenterX = node.x + NODE_WIDTH / 2 + offsetX
        const parentBottom = node.y + NODE_HEIGHT + offsetY
        const childCenterX = child.x + NODE_WIDTH / 2 + offsetX
        const childTop = child.y + offsetY

        // Draw stepped connector
        const midY = (parentBottom + childTop) / 2
        ctx.moveTo(parentCenterX, parentBottom)
        ctx.lineTo(parentCenterX, midY)
        ctx.lineTo(childCenterX, midY)
        ctx.lineTo(childCenterX, childTop)
        ctx.stroke()

        drawConnectors(child)
      }
    }

    // Draw nodes
    const drawNode = (node: LayoutNode) => {
      const x = node.x + offsetX
      const y = node.y + offsetY

      // Node background
      ctx.fillStyle = '#1a1a24'
      ctx.strokeStyle = 'rgba(244,123,32,0.3)'
      ctx.lineWidth = 1
      const radius = 8
      ctx.beginPath()
      ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, radius)
      ctx.fill()
      ctx.stroke()

      // Top accent line
      ctx.fillStyle = '#F47B20'
      ctx.beginPath()
      ctx.roundRect(x, y, NODE_WIDTH, 3, [radius, radius, 0, 0])
      ctx.fill()

      // Name
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(node.name, x + NODE_WIDTH / 2, y + 24, NODE_WIDTH - 16)

      // Title
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '9px sans-serif'
      ctx.fillText(node.title, x + NODE_WIDTH / 2, y + 42, NODE_WIDTH - 16)

      node.children.forEach(drawNode)
    }

    drawConnectors(tree)
    drawNode(tree)
  }, [buildTree])

  const handleDownloadPNG = () => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'org-chart.png')
    })
  }

  const rootNodes = nodes.filter((n) => !n.reportsTo)

  return (
    <div className="h-full flex gap-6">
      {/* Left panel - Node editor */}
      <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto pr-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/70">People ({nodes.length})</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={12} />}
            onClick={() => setNodes([{ id: 'root', name: 'CEO', title: 'Chief Executive Officer', reportsTo: '' }])}
          >
            Reset
          </Button>
        </div>

        {/* Node list */}
        <div className="space-y-2">
          {nodes.map((node) => (
            <div key={node.id} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.03] space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={node.name}
                  onChange={(e) => updateNode(node.id, { name: e.target.value })}
                  placeholder="Name"
                  className="flex-1 text-sm bg-transparent border-b border-white/[0.08] text-white focus:outline-none focus:border-[#F47B20]/40"
                />
                {node.reportsTo && (
                  <button
                    onClick={() => removeNode(node.id)}
                    className="p-1 text-white/20 hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={node.title}
                onChange={(e) => updateNode(node.id, { title: e.target.value })}
                placeholder="Title"
                className="w-full text-xs bg-transparent border-b border-white/[0.06] text-white/60 focus:outline-none focus:border-[#F47B20]/30"
              />
              {node.reportsTo && (
                <select
                  value={node.reportsTo}
                  onChange={(e) => updateNode(node.id, { reportsTo: e.target.value })}
                  className="w-full text-[10px] bg-dark-surface border border-white/[0.06] rounded px-1 py-0.5 text-white/50"
                >
                  {nodes
                    .filter((n) => n.id !== node.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        Reports to: {n.name}
                      </option>
                    ))}
                </select>
              )}
              <button
                onClick={() => addNode(node.id)}
                className="flex items-center gap-1 text-[10px] text-[#F47B20]/70 hover:text-[#F47B20]"
              >
                <Plus size={10} /> Add report
              </button>
            </div>
          ))}
        </div>

        {/* Export */}
        <Button onClick={handleDownloadPNG} icon={<Download size={14} />} className="w-full">
          Download PNG
        </Button>
      </div>

      {/* Right panel - Chart preview */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <canvas ref={canvasRef} className="max-w-full" />
        </div>
      </div>
    </div>
  )
}
