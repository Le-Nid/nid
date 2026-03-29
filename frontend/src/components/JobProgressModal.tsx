import { Modal, Progress, Space, Typography, Tag, Alert } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import { useJobSSE } from '../hooks/useJobSSE'

const { Text, Title } = Typography

const TYPE_LABELS: Record<string, string> = {
  bulk_operation: 'Opération bulk',
  archive_mails:  'Archivage NAS',
  run_rule:       'Exécution de règle',
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'default',
  active:    'processing',
  completed: 'success',
  failed:    'error',
  cancelled: 'warning',
}

interface Props {
  jobId: string | null
  onClose: () => void
}

export default function JobProgressModal({ jobId, onClose }: Props) {
  const { job, connected } = useJobSSE(jobId)

  const isTerminal = job && ['completed', 'failed', 'cancelled'].includes(job.status)

  return (
    <Modal
      open={!!jobId}
      onCancel={onClose}
      title={
        <Space>
          {job?.status === 'active'
            ? <LoadingOutlined spin style={{ color: '#1677ff' }} />
            : job?.status === 'completed'
            ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
            : job?.status === 'failed'
            ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
            : null}
          {job ? TYPE_LABELS[job.type] ?? job.type : 'Job en cours'}
        </Space>
      }
      footer={null}
      width={480}
    >
      {job ? (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space>
            <Tag color={STATUS_COLORS[job.status]}>{job.status.toUpperCase()}</Tag>
            {!connected && !isTerminal && (
              <Text type="secondary" style={{ fontSize: 12 }}>Reconnexion…</Text>
            )}
          </Space>

          <Progress
            percent={job.progress}
            status={
              job.status === 'failed'
                ? 'exception'
                : job.status === 'completed'
                ? 'success'
                : 'active'
            }
            format={() => `${job.processed ?? 0} / ${job.total ?? 0}`}
          />

          {job.error && (
            <Alert type="error" message="Erreur" description={job.error} showIcon />
          )}

          {job.status === 'completed' && (
            <Alert
              type="success"
              message={`Terminé — ${job.processed} éléments traités`}
              showIcon
            />
          )}
        </Space>
      ) : (
        <Text type="secondary">Connexion au flux temps réel…</Text>
      )}
    </Modal>
  )
}
