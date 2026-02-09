import type { OrgChartState } from './types.ts'
import { createNode, DEPARTMENT_COLORS } from './types.ts'

export interface OrgTemplate {
  name: string
  description: string
  nodeCount: number
  build: () => OrgChartState
}

export const TEMPLATES: OrgTemplate[] = [
  {
    name: 'Blank',
    description: 'A single root node to start from scratch',
    nodeCount: 1,
    build: () => ({
      nodes: [
        createNode({ id: 'root', name: 'CEO', title: 'Chief Executive Officer', reportsTo: '', department: 'Executive', nodeColor: '#F47B20' }),
      ],
    }),
  },
  {
    name: 'Startup',
    description: 'CEO with 3 VPs, each having 2 direct reports',
    nodeCount: 10,
    build: () => ({
      nodes: [
        createNode({ id: 't-ceo', name: 'Alex Chen', title: 'CEO & Co-Founder', reportsTo: '', department: 'Executive', nodeColor: '#F47B20' }),

        createNode({ id: 't-vpe', name: 'Sarah Kim', title: 'VP of Engineering', reportsTo: 't-ceo', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 't-vpm', name: 'Mike Patel', title: 'VP of Marketing', reportsTo: 't-ceo', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),
        createNode({ id: 't-vps', name: 'Jordan Lee', title: 'VP of Sales', reportsTo: 't-ceo', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),

        createNode({ id: 't-eng1', name: 'Dev Lead', title: 'Senior Engineer', reportsTo: 't-vpe', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 't-eng2', name: 'QA Lead', title: 'QA Engineer', reportsTo: 't-vpe', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 't-mkt1', name: 'Content Manager', title: 'Content Lead', reportsTo: 't-vpm', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),
        createNode({ id: 't-mkt2', name: 'Growth Lead', title: 'Growth Hacker', reportsTo: 't-vpm', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),

        createNode({ id: 't-sal1', name: 'AE Lead', title: 'Account Executive', reportsTo: 't-vps', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),
        createNode({ id: 't-sal2', name: 'SDR Lead', title: 'Sales Development', reportsTo: 't-vps', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),
      ],
    }),
  },
  {
    name: 'Corporate',
    description: 'CEO, C-suite, Directors, and Managers — 4 levels',
    nodeCount: 18,
    build: () => ({
      nodes: [
        createNode({ id: 'c-ceo', name: 'James Wilson', title: 'Chief Executive Officer', reportsTo: '', department: 'Executive', nodeColor: '#F47B20' }),

        createNode({ id: 'c-cto', name: 'Lisa Zhang', title: 'Chief Technology Officer', reportsTo: 'c-ceo', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'c-cmo', name: 'David Brown', title: 'Chief Marketing Officer', reportsTo: 'c-ceo', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),
        createNode({ id: 'c-cfo', name: 'Maria Garcia', title: 'Chief Financial Officer', reportsTo: 'c-ceo', department: 'Finance', nodeColor: DEPARTMENT_COLORS.Finance }),
        createNode({ id: 'c-coo', name: 'Robert Taylor', title: 'Chief Operating Officer', reportsTo: 'c-ceo', department: 'Operations', nodeColor: DEPARTMENT_COLORS.Operations }),

        createNode({ id: 'c-dir-eng', name: 'Tom Harris', title: 'Director of Engineering', reportsTo: 'c-cto', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'c-dir-des', name: 'Amy Liu', title: 'Director of Design', reportsTo: 'c-cto', department: 'Design', nodeColor: DEPARTMENT_COLORS.Design }),

        createNode({ id: 'c-dir-mkt', name: 'Chris Moore', title: 'Director of Marketing', reportsTo: 'c-cmo', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),
        createNode({ id: 'c-dir-sal', name: 'Kate White', title: 'Director of Sales', reportsTo: 'c-cmo', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),

        createNode({ id: 'c-dir-fin', name: 'Paul Adams', title: 'Director of Finance', reportsTo: 'c-cfo', department: 'Finance', nodeColor: DEPARTMENT_COLORS.Finance }),

        createNode({ id: 'c-dir-ops', name: 'Rachel Green', title: 'Director of Ops', reportsTo: 'c-coo', department: 'Operations', nodeColor: DEPARTMENT_COLORS.Operations }),
        createNode({ id: 'c-dir-hr', name: 'Nina Stone', title: 'Director of HR', reportsTo: 'c-coo', department: 'HR', nodeColor: DEPARTMENT_COLORS.HR }),

        createNode({ id: 'c-mgr1', name: 'Backend Lead', title: 'Engineering Manager', reportsTo: 'c-dir-eng', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'c-mgr2', name: 'Frontend Lead', title: 'Engineering Manager', reportsTo: 'c-dir-eng', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 'c-mgr3', name: 'UX Lead', title: 'Design Manager', reportsTo: 'c-dir-des', department: 'Design', nodeColor: DEPARTMENT_COLORS.Design }),

        createNode({ id: 'c-mgr4', name: 'Brand Lead', title: 'Marketing Manager', reportsTo: 'c-dir-mkt', department: 'Marketing', nodeColor: DEPARTMENT_COLORS.Marketing }),

        createNode({ id: 'c-mgr5', name: 'East Region', title: 'Sales Manager', reportsTo: 'c-dir-sal', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),
        createNode({ id: 'c-mgr6', name: 'West Region', title: 'Sales Manager', reportsTo: 'c-dir-sal', department: 'Sales', nodeColor: DEPARTMENT_COLORS.Sales }),
      ],
    }),
  },
  {
    name: 'Department',
    description: 'Director with 3 Managers, each with 2 individual contributors',
    nodeCount: 10,
    build: () => ({
      nodes: [
        createNode({ id: 'd-dir', name: 'Engineering Director', title: 'Director of Engineering', reportsTo: '', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 'd-mgr1', name: 'Platform Manager', title: 'Engineering Manager', reportsTo: 'd-dir', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'd-mgr2', name: 'Product Manager', title: 'Engineering Manager', reportsTo: 'd-dir', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'd-mgr3', name: 'Infra Manager', title: 'Engineering Manager', reportsTo: 'd-dir', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 'd-ic1', name: 'Backend Dev', title: 'Senior Engineer', reportsTo: 'd-mgr1', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'd-ic2', name: 'API Dev', title: 'Software Engineer', reportsTo: 'd-mgr1', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 'd-ic3', name: 'Frontend Dev', title: 'Senior Engineer', reportsTo: 'd-mgr2', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'd-ic4', name: 'Mobile Dev', title: 'Software Engineer', reportsTo: 'd-mgr2', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),

        createNode({ id: 'd-ic5', name: 'DevOps Lead', title: 'Senior SRE', reportsTo: 'd-mgr3', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
        createNode({ id: 'd-ic6', name: 'Cloud Engineer', title: 'Software Engineer', reportsTo: 'd-mgr3', department: 'Engineering', nodeColor: DEPARTMENT_COLORS.Engineering }),
      ],
    }),
  },
]
