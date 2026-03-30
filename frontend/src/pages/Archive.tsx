import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Space,
  Button,
  Tag,
  Typography,
  Card,
  Drawer,
  Divider,
  List,
  Empty,
  message,
  notification,
  DatePicker,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  FileZipOutlined,
  FileOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { archiveApi } from "../api";
import { useAccount } from "../hooks/useAccount";
import { formatBytes, formatSender } from "../utils/format";
import JobProgressModal from "../components/JobProgressModal";
import api from "../api/client";
import dayjs from "dayjs";

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

interface ArchivedMail {
  id: string;
  gmail_message_id: string;
  subject: string;
  sender: string;
  date: string;
  size_bytes: number;
  has_attachments: boolean;
  label_ids: string[];
  archived_at: string;
  snippet: string;
}

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export default function ArchivePage() {
  const { t } = useTranslation();
  const { accountId } = useAccount();
  const [mails, setMails] = useState<ArchivedMail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sender, setSender] = useState("");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Viewer drawer
  const [viewing, setViewing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"html" | "raw">("html");

  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(
    async (p = 1) => {
      if (!accountId) return;
      setLoading(true);
      try {
        const params: Record<string, any> = { page: p, limit: 50 };
        if (query) params.q = query;
        if (sender) params.sender = sender;
        if (dateRange) {
          params.from_date = dateRange[0].toISOString();
          params.to_date = dateRange[1].toISOString();
        }
        const data = await archiveApi.listMails(accountId, params);
        setMails(data.mails);
        setTotal(data.total);
        setPage(p);
      } catch {
        messageApi.error(t('archive.loadError'));
      } finally {
        setLoading(false);
      }
    },
    [accountId, query, sender, dateRange],
  );

  useEffect(() => {
    load();
  }, [accountId]);

  const openMail = async (mail: ArchivedMail) => {
    try {
      const detail = await archiveApi.getMail(accountId!, mail.id);
      setViewing(detail);
      setViewMode("html");
    } catch {
      messageApi.error(t('archive.loadMailError'));
    }
  };

  // ─── Export ZIP ──────────────────────────────────────────
  const exportZip = async (ids: string[]) => {
    if (!ids.length || !accountId) return;
    setExporting(true);
    try {
      const response = await api.post(
        `/api/archive/${accountId}/export-zip`,
        { mailIds: ids },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const filename = `archive-export-${dayjs().format("YYYY-MM-DD")}.zip`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notification.success({
        message: t('archive.exportDone'),
        description: t('archive.exportCount', { count: ids.length }),
      });
    } catch {
      messageApi.error(t('archive.exportError'));
    } finally {
      setExporting(false);
    }
  };

  // ─── Preview HTML inline depuis EML ─────────────────────
  function extractHtmlFromEml(emlContent: string): string {
    // Chercher le boundary MIME
    const boundaryMatch = emlContent.match(/boundary="?([^"\r\n;]+)"?/i);
    if (!boundaryMatch) {
      // Mail simple texte
      const bodyStart =
        emlContent.indexOf("\r\n\r\n") + 4 || emlContent.indexOf("\n\n") + 2;
      return `<pre style="white-space:pre-wrap;font-family:inherit">${emlContent.slice(bodyStart)}</pre>`;
    }

    const boundary = boundaryMatch[1];
    const parts = emlContent.split(`--${boundary}`);
    for (const part of parts) {
      if (/content-type:\s*text\/html/i.test(part)) {
        const bodyIdx =
          part.indexOf("\r\n\r\n") !== -1
            ? part.indexOf("\r\n\r\n") + 4
            : part.indexOf("\n\n") + 2;
        const encoding = /content-transfer-encoding:\s*base64/i.test(part)
          ? "base64"
          : "plain";
        const raw = part.slice(bodyIdx).trim();
        if (encoding === "base64") {
          try {
            return atob(raw.replace(/\s/g, ""));
          } catch {
            return raw;
          }
        }
        return raw;
      }
    }
    // Fallback : texte brut
    return `<pre style="white-space:pre-wrap;font-family:inherit">${emlContent}</pre>`;
  }

  const downloadUrl = (attachmentId: string) =>
    archiveApi.downloadAttachment(accountId!, attachmentId);

  const columns = [
    {
      title: t('archive.sender'),
      dataIndex: "sender",
      width: 190,
      ellipsis: true,
      render: (v: string) => (
        <Text strong style={{ fontSize: 13 }}>
          {formatSender(v)}
        </Text>
      ),
    },
    {
      title: t('archive.subject'),
      dataIndex: "subject",
      ellipsis: true,
      render: (v: string, row: ArchivedMail) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            {row.has_attachments && (
              <PaperClipOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
            )}
            <Text style={{ fontSize: 13 }}>{v || t('common.noSubject')}</Text>
          </Space>
          <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
            {row.snippet}
          </Text>
        </Space>
      ),
    },
    {
      title: t('archive.size'),
      dataIndex: "size_bytes",
      width: 90,
      sorter: (a: ArchivedMail, b: ArchivedMail) => a.size_bytes - b.size_bytes,
      render: (v: number) => <Tag color="orange">{formatBytes(v)}</Tag>,
    },
    {
      title: t('archive.date'),
      dataIndex: "date",
      width: 100,
      sorter: true,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format("DD/MM/YY") : "—"}
        </Text>
      ),
    },
    {
      title: t('archive.archived'),
      dataIndex: "archived_at",
      width: 120,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(v).format("DD/MM/YY HH:mm")}
        </Text>
      ),
    },
    {
      title: "",
      width: 50,
      render: (_: any, row: ArchivedMail) => (
        <Tooltip title={t('mailManager.read')}>
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              openMail(row);
            }}
          />
        </Tooltip>
      ),
    },
  ];

  const selectedSizeBytes = mails
    .filter((m) => selected.includes(m.id))
    .reduce((s, m) => s + m.size_bytes, 0);

  return (
    <div>
      {contextHolder}

      <Title level={3} style={{ marginBottom: 16 }}>
        {t('archive.title')}
      </Title>

      {/* Filtres */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Search
            placeholder={t('archive.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => load(1)}
            style={{ width: 300 }}
            allowClear
            enterButton={<SearchOutlined />}
          />
          <Input
            placeholder={t('archive.filterSender')}
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            onPressEnter={() => load(1)}
            style={{ width: 200 }}
            allowClear
            prefix={<FileOutlined />}
          />
          <RangePicker
            onChange={(dates) => setDateRange(dates as any)}
            format="DD/MM/YYYY"
            placeholder={[t('archive.dateStart'), t('archive.dateEnd')]}
          />
          <Button type="primary" onClick={() => load(1)} loading={loading}>
            <SearchOutlined /> {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => load(1)} />
          {total > 0 && (
            <Text type="secondary">
              {t('archive.totalArchived', { total: total.toLocaleString() })}
            </Text>
          )}
        </Space>
      </Card>

      {/* Barre bulk sélection */}
      {selected.length > 0 && (
        <Card
          size="small"
          style={{
            marginBottom: 12,
            background: "#e6f4ff",
            borderColor: "#91caff",
          }}
        >
          <Space>
            <Text strong style={{ color: "#1677ff" }}>
              {t('archive.selectedCount', { count: selected.length, size: formatBytes(selectedSizeBytes) })}
            </Text>
            <Button
              icon={<FileZipOutlined />}
              loading={exporting}
              onClick={() => exportZip(selected)}
            >
              {t('archive.exportZip')}
            </Button>
            <Button size="small" onClick={() => setSelected([])}>
              {t('archive.deselect')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Table */}
      <Table
        dataSource={mails}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          onChange: (p) => load(p),
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString()} mails`,
        }}
        onRow={(row) => ({
          onClick: () => openMail(row),
          style: { cursor: "pointer" },
        })}
        locale={{ emptyText: <Empty description={t('archive.noArchive')} /> }}
      />

      {/* Viewer drawer */}
      <Drawer
        title={
          <Space>
            <Text ellipsis style={{ maxWidth: 480 }}>
              {viewing?.subject || t('common.noSubject')}
            </Text>
            <Button
              size="small"
              onClick={() => exportZip([viewing?.id])}
              icon={<FileZipOutlined />}
            >
              ZIP
            </Button>
          </Space>
        }
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={760}
        styles={{ body: { padding: 16 } }}
      >
        {viewing && (
          <>
            <Space
              direction="vertical"
              size={2}
              style={{ width: "100%", marginBottom: 12 }}
            >
              <Space>
                <Text strong>{t('archive.from')}</Text>
                <Text>{viewing.sender}</Text>
              </Space>
              <Space>
                <Text strong>{t('archive.dateFull')}</Text>
                <Text type="secondary">
                  {dayjs(viewing.date).format("DD/MM/YYYY HH:mm")}
                </Text>
                <Text type="secondary">·</Text>
                <Text type="secondary">{formatBytes(viewing.size_bytes)}</Text>
              </Space>
              <Space>
                <Text strong>{t('archive.archivedAt')}</Text>
                <Text type="secondary">
                  {dayjs(viewing.archived_at).format("DD/MM/YYYY HH:mm")}
                </Text>
              </Space>
            </Space>

            <Divider style={{ margin: "8px 0" }} />

            {/* Pièces jointes */}
            {viewing.attachments?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong>
                  <PaperClipOutlined /> {t('archive.attachments', { count: viewing.attachments.length })}
                </Text>
                <List
                  size="small"
                  dataSource={viewing.attachments}
                  renderItem={(att: Attachment) => (
                    <List.Item
                      actions={[
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          href={downloadUrl(att.id)}
                          download={att.filename}
                        >
                          {t('common.download')}
                        </Button>,
                      ]}
                    >
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Space>
                          <Text style={{ fontSize: 12 }}>{att.filename}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {formatBytes(att.size_bytes)}
                          </Text>
                        </Space>
                        {/* Preview inline pour les images */}
                        {att.mime_type?.startsWith("image/") && (
                          <img
                            src={downloadUrl(att.id)}
                            alt={att.filename}
                            style={{
                              maxWidth: "100%",
                              maxHeight: 240,
                              borderRadius: 4,
                              border: "1px solid #f0f0f0",
                              objectFit: "contain",
                            }}
                            loading="lazy"
                          />
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
                <Divider style={{ margin: "8px 0" }} />
              </div>
            )}

            {/* Toggle HTML / raw EML */}
            <Space style={{ marginBottom: 8 }}>
              <Button
                size="small"
                type={viewMode === "html" ? "primary" : "default"}
                onClick={() => setViewMode("html")}
              >
                {t('archive.htmlView')}
              </Button>
              <Button
                size="small"
                type={viewMode === "raw" ? "primary" : "default"}
                onClick={() => setViewMode("raw")}
              >
                {t('archive.emlRaw')}
              </Button>
            </Space>

            {viewMode === "html" ? (
              <iframe
                srcDoc={extractHtmlFromEml(viewing.emlContent ?? "")}
                style={{
                  width: "100%",
                  minHeight: 500,
                  border: "1px solid #f0f0f0",
                  borderRadius: 4,
                }}
                sandbox="allow-same-origin"
                title="Contenu HTML du mail archivé"
              />
            ) : (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12,
                  fontFamily: "monospace",
                  background: "#f5f5f5",
                  padding: 12,
                  borderRadius: 4,
                  maxHeight: 600,
                  overflow: "auto",
                }}
              >
                {viewing.emlContent}
              </pre>
            )}
          </>
        )}
      </Drawer>

      {/* Modal suivi job (archivage lancé depuis MailManager) */}
      <JobProgressModal
        jobId={activeJobId}
        onClose={() => setActiveJobId(null)}
      />
    </div>
  );
}
