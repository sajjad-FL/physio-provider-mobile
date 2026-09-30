/* Smoke check for the web-ported physio booking workflow (run: node scripts/check-physio-workflow.cjs). */
const babel = require('@babel/core')
const fs = require('fs')
const path = require('path')
const Module = require('module')

// Load ESM utils from src/utils via Babel → CJS.
const origLoad = Module._extensions['.js']
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.includes(`${path.sep}src${path.sep}utils${path.sep}`)) return origLoad(mod, filename)
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  })
  mod._compile(code, filename)
}

const assert = require('assert')
const U = (n) => require(path.join(__dirname, '..', 'src', 'utils', n))
const { physioPageContext, buildPhysioWorkflowSteps, defaultPhysioOpenStep } = U('physioBookingWorkflow.js')
const { physioWorkflowMeta, physioNeedsAction } = U('physioWorkflow.js')

const today = new Date().toISOString().slice(0, 10)
const base = { _id: 'b1', serviceType: 'home', status: 'accepted', userId: { name: 'Asha' }, date: today, timeSlot: '10:00' }

// Home booking with no plan → Care plan step is current, detail badge "Create plan".
let ctx = physioPageContext({ ...base, planStatus: null })
let steps = buildPhysioWorkflowSteps(ctx)
assert.deepStrictEqual(steps.map((s) => s.id), ['patient', 'plan', 'sessions', 'payment'])
assert.strictEqual(defaultPhysioOpenStep(steps), 'plan')
assert.strictEqual(ctx.workflowMeta.label, 'Create plan')

// New-flow "live" plan (the app used to only know 'approved') → plan done, sessions current.
ctx = physioPageContext({
  ...base,
  planStatus: 'live',
  sessions: 2,
  schedule: [{ _id: 's1', date: today, status: 'scheduled' }, { _id: 's2', date: '2999-01-01', status: 'scheduled' }],
})
steps = buildPhysioWorkflowSteps(ctx)
assert.strictEqual(steps.find((s) => s.id === 'plan').state, 'done')
assert.strictEqual(defaultPhysioOpenStep(steps), 'sessions')

// Awaiting consent → plan step waiting; list badge "Awaiting consent".
ctx = physioPageContext({ ...base, planStatus: 'proposed' })
assert.strictEqual(buildPhysioWorkflowSteps(ctx).find((s) => s.id === 'plan').state, 'waiting')
assert.strictEqual(physioWorkflowMeta({ ...base, planStatus: 'awaiting_consent' }).label, 'Awaiting consent')

// Online booking → 3 steps, no care plan.
steps = buildPhysioWorkflowSteps(physioPageContext({ ...base, serviceType: 'online' }))
assert.deepStrictEqual(steps.map((s) => s.id), ['patient', 'sessions', 'payment'])

// Auto-assigned booking → list "Accept case" and counts toward the badge.
assert.strictEqual(physioWorkflowMeta({ ...base, status: 'assigned' }).label, 'Accept case')
assert.strictEqual(physioNeedsAction({ ...base, status: 'assigned' }), true)

console.log('physio workflow checks passed')
