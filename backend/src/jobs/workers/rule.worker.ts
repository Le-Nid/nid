import { Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { getDb } from '../db'
import { getRule, runRule } from '../rules/rules.service'

interface RunRulePayload { accountId: string; ruleId: string }

export function startRuleWorker() {
  const worker = new Worker<RunRulePayload>(
    'gmail-manager',
    async (job: Job<RunRulePayload>) => {
      if (job.name !== 'run_rule') return
      const { accountId, ruleId } = job.data
      const db = getDb()

      await db.insertInto('jobs')
        .values({
          bullmq_id:        String(job.id),
          type:             'run_rule',
          status:           'active',
          gmail_account_id: accountId,
          payload:          JSON.stringify(job.data),
        })
        .onConflict((oc) => oc.doNothing())
        .execute()

      try {
        const rule = await getRule(ruleId, accountId)
        if (!rule) throw new Error(`Rule ${ruleId} not found`)
        if (!rule.is_active) throw new Error(`Rule ${ruleId} is disabled`)

        const result = await runRule(rule, accountId)

        await db.updateTable('jobs')
          .set({ status: 'completed', progress: 100, completed_at: new Date(), payload: JSON.stringify({ ...job.data, result }) })
          .where('bullmq_id', '=', String(job.id))
          .execute()

        return result
      } catch (err) {
        await db.updateTable('jobs')
          .set({ status: 'failed', error: String(err) })
          .where('bullmq_id', '=', String(job.id))
          .execute()
        throw err
      }
    },
    { connection: getRedis(), concurrency: 2 }
  )
  worker.on('failed', (job, err) => console.error(`Rule job ${job?.id} failed:`, err.message))
  return worker
}
