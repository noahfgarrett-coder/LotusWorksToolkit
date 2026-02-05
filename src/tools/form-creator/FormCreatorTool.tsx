import { useState, useCallback } from 'react'
import { Button } from '@/components/common/Button.tsx'
import { downloadBlob } from '@/utils/download.ts'
import { PDFDocument, rgb } from 'pdf-lib'
import { Download, Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'

type FieldType = 'text' | 'textarea' | 'checkbox' | 'radio' | 'date' | 'label' | 'signature'

interface FormField {
  id: string
  type: FieldType
  label: string
  options?: string[] // for radio buttons
  required?: boolean
}

const FIELD_TYPES: { id: FieldType; label: string; description: string }[] = [
  { id: 'text', label: 'Text Field', description: 'Single line text input' },
  { id: 'textarea', label: 'Text Area', description: 'Multi-line text input' },
  { id: 'checkbox', label: 'Checkbox', description: 'Yes/No checkbox' },
  { id: 'radio', label: 'Radio Group', description: 'Multiple choice selection' },
  { id: 'date', label: 'Date Field', description: 'Date input field' },
  { id: 'label', label: 'Label', description: 'Section header or label' },
  { id: 'signature', label: 'Signature', description: 'Signature line' },
]

const TEMPLATES = [
  {
    name: 'Sign-in Sheet',
    fields: [
      { type: 'label' as FieldType, label: 'Sign-in Sheet' },
      { type: 'text' as FieldType, label: 'Name' },
      { type: 'text' as FieldType, label: 'Company' },
      { type: 'date' as FieldType, label: 'Date' },
      { type: 'text' as FieldType, label: 'Time In' },
      { type: 'text' as FieldType, label: 'Time Out' },
      { type: 'signature' as FieldType, label: 'Signature' },
    ],
  },
  {
    name: 'Contact Form',
    fields: [
      { type: 'label' as FieldType, label: 'Contact Information' },
      { type: 'text' as FieldType, label: 'Full Name' },
      { type: 'text' as FieldType, label: 'Email' },
      { type: 'text' as FieldType, label: 'Phone Number' },
      { type: 'textarea' as FieldType, label: 'Message' },
    ],
  },
  {
    name: 'Work Order',
    fields: [
      { type: 'label' as FieldType, label: 'Work Order' },
      { type: 'text' as FieldType, label: 'Order Number' },
      { type: 'date' as FieldType, label: 'Date' },
      { type: 'text' as FieldType, label: 'Requested By' },
      { type: 'text' as FieldType, label: 'Department' },
      { type: 'textarea' as FieldType, label: 'Description of Work' },
      { type: 'radio' as FieldType, label: 'Priority', options: ['Low', 'Medium', 'High', 'Urgent'] },
      { type: 'textarea' as FieldType, label: 'Notes' },
      { type: 'signature' as FieldType, label: 'Approved By' },
    ],
  },
  {
    name: 'Inspection Form',
    fields: [
      { type: 'label' as FieldType, label: 'Inspection Report' },
      { type: 'text' as FieldType, label: 'Inspector Name' },
      { type: 'date' as FieldType, label: 'Date' },
      { type: 'text' as FieldType, label: 'Location' },
      { type: 'checkbox' as FieldType, label: 'Equipment Operational' },
      { type: 'checkbox' as FieldType, label: 'Safety Guards in Place' },
      { type: 'checkbox' as FieldType, label: 'Area Clean & Organized' },
      { type: 'checkbox' as FieldType, label: 'PPE Available' },
      { type: 'textarea' as FieldType, label: 'Findings / Notes' },
      { type: 'radio' as FieldType, label: 'Result', options: ['Pass', 'Fail', 'Needs Attention'] },
      { type: 'signature' as FieldType, label: 'Inspector Signature' },
    ],
  },
]

function genId() {
  return Math.random().toString(36).substring(2, 11)
}

export default function FormCreatorTool() {
  const [formTitle, setFormTitle] = useState('New Form')
  const [fields, setFields] = useState<FormField[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const addField = (type: FieldType) => {
    const fieldDef = FIELD_TYPES.find((f) => f.id === type)
    const newField: FormField = {
      id: genId(),
      type,
      label: fieldDef?.label ?? type,
      options: type === 'radio' ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
    }
    setFields((prev) => [...prev, newField])
  }

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const moveField = (idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const loadTemplate = (template: typeof TEMPLATES[0]) => {
    setFormTitle(template.name)
    setFields(
      template.fields.map((f) => ({
        id: genId(),
        ...f,
      })),
    )
  }

  const handleExportPDF = useCallback(async () => {
    if (fields.length === 0) return
    setIsExporting(true)

    try {
      const pdfDoc = await PDFDocument.create()
      const pageWidth = 595
      const pageHeight = 842
      const margin = 50
      const lineHeight = 24
      const fieldSpacing = 8

      let page = pdfDoc.addPage([pageWidth, pageHeight])
      let y = pageHeight - margin

      // Draw title
      page.drawText(formTitle, {
        x: margin,
        y,
        size: 18,
        color: rgb(0.1, 0.1, 0.1),
      })
      y -= 36

      // Draw a line under title
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })
      y -= 20

      for (const field of fields) {
        // Check if we need a new page
        const neededHeight = field.type === 'textarea' ? 80 : field.type === 'radio' ? (field.options?.length ?? 3) * lineHeight + 30 : 50
        if (y - neededHeight < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight])
          y = pageHeight - margin
        }

        const contentWidth = pageWidth - margin * 2

        switch (field.type) {
          case 'label':
            y -= 10
            page.drawText(field.label, {
              x: margin,
              y,
              size: 14,
              color: rgb(0.2, 0.2, 0.2),
            })
            y -= 6
            page.drawLine({
              start: { x: margin, y },
              end: { x: pageWidth - margin, y },
              thickness: 0.5,
              color: rgb(0.8, 0.8, 0.8),
            })
            y -= fieldSpacing
            break

          case 'text':
          case 'date':
            page.drawText(field.label + (field.type === 'date' ? ' (Date)' : ''), {
              x: margin,
              y,
              size: 10,
              color: rgb(0.3, 0.3, 0.3),
            })
            y -= 4
            page.drawLine({
              start: { x: margin, y },
              end: { x: margin + contentWidth, y },
              thickness: 0.5,
              color: rgb(0.6, 0.6, 0.6),
            })
            y -= lineHeight + fieldSpacing
            break

          case 'textarea':
            page.drawText(field.label, {
              x: margin,
              y,
              size: 10,
              color: rgb(0.3, 0.3, 0.3),
            })
            y -= 6
            // Draw a box
            page.drawRectangle({
              x: margin,
              y: y - 50,
              width: contentWidth,
              height: 50,
              borderColor: rgb(0.6, 0.6, 0.6),
              borderWidth: 0.5,
            })
            y -= 50 + fieldSpacing
            break

          case 'checkbox':
            // Draw checkbox square
            page.drawRectangle({
              x: margin,
              y: y - 10,
              width: 12,
              height: 12,
              borderColor: rgb(0.4, 0.4, 0.4),
              borderWidth: 0.5,
            })
            page.drawText(field.label, {
              x: margin + 20,
              y: y - 8,
              size: 10,
              color: rgb(0.3, 0.3, 0.3),
            })
            y -= lineHeight + fieldSpacing
            break

          case 'radio':
            page.drawText(field.label, {
              x: margin,
              y,
              size: 10,
              color: rgb(0.3, 0.3, 0.3),
            })
            y -= lineHeight
            for (const option of field.options ?? []) {
              // Draw circle
              page.drawCircle({
                x: margin + 6,
                y: y - 3,
                size: 5,
                borderColor: rgb(0.4, 0.4, 0.4),
                borderWidth: 0.5,
              })
              page.drawText(option, {
                x: margin + 20,
                y: y - 8,
                size: 10,
                color: rgb(0.3, 0.3, 0.3),
              })
              y -= lineHeight
            }
            y -= fieldSpacing
            break

          case 'signature':
            page.drawText(field.label, {
              x: margin,
              y,
              size: 10,
              color: rgb(0.3, 0.3, 0.3),
            })
            y -= 6
            page.drawLine({
              start: { x: margin, y },
              end: { x: margin + 200, y },
              thickness: 0.5,
              color: rgb(0.4, 0.4, 0.4),
            })
            y -= lineHeight + fieldSpacing
            break
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      downloadBlob(blob, `${formTitle.replace(/\s+/g, '-').toLowerCase()}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }, [fields, formTitle])

  return (
    <div className="h-full flex gap-6">
      {/* Left panel - Field palette & templates */}
      <div className="w-64 flex-shrink-0 space-y-5 overflow-y-auto pr-2">
        {/* Templates */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-white/70">Templates</span>
          <div className="space-y-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => loadTemplate(t)}
                className="w-full text-left px-3 py-2 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Add field */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-white/70">Add Field</span>
          <div className="space-y-1">
            {FIELD_TYPES.map((f) => (
              <button
                key={f.id}
                onClick={() => addField(f.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:border-[#F47B20]/30 transition-colors"
              >
                <Plus size={12} className="text-[#F47B20]" />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="pt-4">
          <Button
            onClick={handleExportPDF}
            disabled={fields.length === 0 || isExporting}
            icon={<Download size={14} />}
            className="w-full"
          >
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {/* Right panel - Form builder */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Form title */}
        <input
          type="text"
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          className="text-lg font-semibold bg-transparent border-b border-white/[0.1] text-white focus:outline-none focus:border-[#F47B20]/40 pb-2"
        />

        {/* Fields list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {fields.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              Add fields from the left panel or choose a template
            </div>
          ) : (
            fields.map((field, idx) => (
              <div
                key={field.id}
                className="flex items-start gap-2 p-3 rounded-lg border border-white/[0.06] bg-white/[0.03]"
              >
                <GripVertical size={14} className="text-white/20 mt-1 flex-shrink-0" />

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase text-[#F47B20] font-semibold">{field.type}</span>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      className="flex-1 text-sm bg-transparent border-b border-white/[0.08] text-white focus:outline-none focus:border-[#F47B20]/40"
                    />
                  </div>

                  {/* Radio options editor */}
                  {field.type === 'radio' && field.options && (
                    <div className="space-y-1 pl-4">
                      {field.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full border border-white/30" />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...field.options!]
                              newOpts[optIdx] = e.target.value
                              updateField(field.id, { options: newOpts })
                            }}
                            className="flex-1 text-xs bg-transparent border-b border-white/[0.06] text-white/70 focus:outline-none focus:border-[#F47B20]/30"
                          />
                          <button
                            onClick={() => {
                              const newOpts = field.options!.filter((_, i) => i !== optIdx)
                              updateField(field.id, { options: newOpts })
                            }}
                            className="text-white/20 hover:text-red-400"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          updateField(field.id, { options: [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`] })
                        }}
                        className="text-[10px] text-[#F47B20]/70 hover:text-[#F47B20]"
                      >
                        + Add option
                      </button>
                    </div>
                  )}
                </div>

                {/* Move / delete */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => moveField(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-white/20 hover:text-white/60 disabled:opacity-20"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => moveField(idx, 1)}
                    disabled={idx === fields.length - 1}
                    className="p-1 text-white/20 hover:text-white/60 disabled:opacity-20"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    onClick={() => removeField(field.id)}
                    className="p-1 text-white/20 hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
