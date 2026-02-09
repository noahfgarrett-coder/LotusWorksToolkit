import type { FormDocument } from './types.ts'
import { createElement, createDocument } from './types.ts'

export interface FormTemplate {
  name: string
  description: string
  elementCount: number
  build: () => FormDocument
}

export const TEMPLATES: FormTemplate[] = [
  {
    name: 'Blank',
    description: 'A single blank page to start from scratch',
    elementCount: 0,
    build: () => createDocument({ title: 'New Form' }),
  },
  {
    name: 'Sign-in Sheet',
    description: 'Name, company, date, time in/out, and signature',
    elementCount: 7,
    build: () => createDocument({
      title: 'Sign-in Sheet',
      elements: [
        createElement('heading', 0, { id: 'si-h', label: 'Sign-in Sheet', x: 48, y: 40, width: 720, fontWeight: 'bold', fontSize: 24, textAlign: 'center' }),
        createElement('divider', 0, { id: 'si-d', x: 48, y: 90, width: 720 }),
        createElement('text-input', 0, { id: 'si-name', label: 'Name', x: 48, y: 120, width: 340 }),
        createElement('text-input', 0, { id: 'si-co', label: 'Company', x: 420, y: 120, width: 340 }),
        createElement('date', 0, { id: 'si-date', label: 'Date', x: 48, y: 190, width: 200 }),
        createElement('text-input', 0, { id: 'si-tin', label: 'Time In', x: 280, y: 190, width: 200 }),
        createElement('text-input', 0, { id: 'si-tout', label: 'Time Out', x: 510, y: 190, width: 200 }),
        createElement('signature', 0, { id: 'si-sig', label: 'Signature', x: 48, y: 270, width: 300 }),
      ],
    }),
  },
  {
    name: 'Contact Form',
    description: 'Full name, email, phone, and message fields',
    elementCount: 5,
    build: () => createDocument({
      title: 'Contact Form',
      elements: [
        createElement('heading', 0, { id: 'cf-h', label: 'Contact Information', x: 48, y: 40, width: 720, fontWeight: 'bold', fontSize: 22, textAlign: 'center' }),
        createElement('text-input', 0, { id: 'cf-name', label: 'Full Name', x: 48, y: 110, width: 720, required: true }),
        createElement('text-input', 0, { id: 'cf-email', label: 'Email', x: 48, y: 180, width: 340, required: true, placeholder: 'name@example.com' }),
        createElement('text-input', 0, { id: 'cf-phone', label: 'Phone Number', x: 420, y: 180, width: 340, placeholder: '+1 (555) 000-0000' }),
        createElement('textarea', 0, { id: 'cf-msg', label: 'Message', x: 48, y: 260, width: 720, height: 120 }),
      ],
    }),
  },
  {
    name: 'Work Order',
    description: 'Order number, date, requester, description, priority, and approval',
    elementCount: 9,
    build: () => createDocument({
      title: 'Work Order',
      elements: [
        createElement('heading', 0, { id: 'wo-h', label: 'Work Order', x: 48, y: 40, width: 720, fontWeight: 'bold', fontSize: 24, textAlign: 'center' }),
        createElement('divider', 0, { id: 'wo-d', x: 48, y: 90, width: 720 }),
        createElement('text-input', 0, { id: 'wo-num', label: 'Order Number', x: 48, y: 120, width: 200 }),
        createElement('date', 0, { id: 'wo-date', label: 'Date', x: 280, y: 120, width: 200 }),
        createElement('text-input', 0, { id: 'wo-req', label: 'Requested By', x: 48, y: 190, width: 340 }),
        createElement('text-input', 0, { id: 'wo-dept', label: 'Department', x: 420, y: 190, width: 340 }),
        createElement('textarea', 0, { id: 'wo-desc', label: 'Description of Work', x: 48, y: 260, width: 720, height: 120 }),
        createElement('radio', 0, { id: 'wo-pri', label: 'Priority', x: 48, y: 400, width: 200, height: 110, options: ['Low', 'Medium', 'High', 'Urgent'] }),
        createElement('textarea', 0, { id: 'wo-notes', label: 'Notes', x: 280, y: 400, width: 480, height: 110 }),
        createElement('signature', 0, { id: 'wo-sig', label: 'Approved By', x: 48, y: 540, width: 300 }),
      ],
    }),
  },
  {
    name: 'Inspection Form',
    description: 'Inspector, date, location, checklist items, findings, and result',
    elementCount: 11,
    build: () => createDocument({
      title: 'Inspection Report',
      elements: [
        createElement('heading', 0, { id: 'if-h', label: 'Inspection Report', x: 48, y: 40, width: 720, fontWeight: 'bold', fontSize: 24, textAlign: 'center' }),
        createElement('divider', 0, { id: 'if-d', x: 48, y: 90, width: 720 }),
        createElement('text-input', 0, { id: 'if-insp', label: 'Inspector Name', x: 48, y: 120, width: 340 }),
        createElement('date', 0, { id: 'if-date', label: 'Date', x: 420, y: 120, width: 200 }),
        createElement('text-input', 0, { id: 'if-loc', label: 'Location', x: 48, y: 190, width: 720 }),
        createElement('checkbox', 0, { id: 'if-c1', label: 'Equipment Operational', x: 48, y: 260, width: 300 }),
        createElement('checkbox', 0, { id: 'if-c2', label: 'Safety Guards in Place', x: 380, y: 260, width: 300 }),
        createElement('checkbox', 0, { id: 'if-c3', label: 'Area Clean & Organized', x: 48, y: 300, width: 300 }),
        createElement('checkbox', 0, { id: 'if-c4', label: 'PPE Available', x: 380, y: 300, width: 300 }),
        createElement('textarea', 0, { id: 'if-notes', label: 'Findings / Notes', x: 48, y: 350, width: 720, height: 120 }),
        createElement('radio', 0, { id: 'if-res', label: 'Result', x: 48, y: 490, width: 200, height: 90, options: ['Pass', 'Fail', 'Needs Attention'] }),
        createElement('signature', 0, { id: 'if-sig', label: 'Inspector Signature', x: 48, y: 600, width: 300 }),
      ],
    }),
  },
]
