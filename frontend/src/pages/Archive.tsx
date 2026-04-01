import { useState } from "react";
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
import { useArchiveMails } from "../hooks/queries";
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
  const [page, setPage] = useState(1);
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

  // Build params for the query
  const archiveParams: Record<string, any> = { page, limit: 50 };
  if (query) archiveParams.q = query;
  if (sender) archiveParams.sender = sender;
  if (dateRange) {
    archiveParams.from_date = dateRange[0].toISOString();
    archiveParams.to_date = dateRange[1].toISOString();
  }

  const { data: archiveData, isLoading: loading, refetch } = useArchiveMails(accountId, archiveParams);
  const mails = archiveData?.mails ?? [];
  const total = archiveData?.total ?? 0;

  const load = (p = 1) => {
    setPage(p);
    if (p === page) refetch();
  };

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
        title: t('archive.exportDone'),
        description: t('archive.exportCount', { count: ids.length }),
      });
    } catch {
      messageApi.error(t('archive.exportError'));
    } finally {
      setExporting(false);
    }
  };

  // ─── Preview HTML inline depuis EML ─────────────────────
  function decodeBase64Utf8(b64: string): string {
    const binary = atob(b64.replaceAll(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function decodeQuotedPrintable(str: string): string {
    const decoded = str
      .replaceAll(/=\r?\n/g, '') // soft line breaks
      .replaceAll(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    // The result is raw bytes as Latin-1 chars — re-interpret as UTF-8
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return decoded;
    }
  }

  function decodePartBody(raw: string, part: string): string {
    const isBase64 = /content-transfer-encoding:\s*base64/i.test(part);
    const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(part);
    if (isBase64) {
      try {
        return decodeBase64Utf8(raw);
      } catch {
        return raw;
      }
    }
    if (isQP) return decodeQuotedPrintable(raw);
    return raw;
  }

  function extractBodyFromParts(emlContent: string, boundary: string, depth = 0): string | null {
    if (depth > 5) return null; // guard against infinite recursion
    const parts = emlContent.split(`--${boundary}`);
    let htmlPart: string | null = null;
    let textPart: string | null = null;

    for (const part of parts) {
      // Extract only the header section of this part
      const headerEnd = part.indexOf('\r\n\r\n') !== -1
        ? part.indexOf('\r\n\r\n')
        : part.indexOf('\n\n');
      if (headerEnd < 0) continue;
      const partHeader = part.slice(0, headerEnd);

      // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
      const nestedBoundary = partHeader.match(/content-type:\s*multipart\/\w+[^]*?boundary="?([^"\r\n;]+)"?/i);
      if (nestedBoundary) {
        const nested = extractBodyFromParts(part, nestedBoundary[1], depth + 1);
        if (nested) return nested;
        continue;
      }

      const bodyIdx = headerEnd + (part.indexOf('\r\n\r\n') !== -1 ? 4 : 2);
      const raw = part.slice(bodyIdx).trim();

      if (/content-type:\s*text\/html/i.test(partHeader)) {
        htmlPart = decodePartBody(raw, partHeader);
      } else if (/content-type:\s*text\/plain/i.test(partHeader) && !textPart) {
        textPart = decodePartBody(raw, partHeader);
      }
    }

    if (htmlPart) return htmlPart;
    if (textPart) return `<pre style="white-space:pre-wrap;font-family:inherit">${textPart}</pre>`;
    return null;
  }

  function extractHtmlFromEml(emlContent: string): string {
    if (!emlContent) return '';

    // Find boundary
    const boundaryMatch = emlContent.match(/boundary="?([^"\r\n;]+)"?/i);
    if (!boundaryMatch) {
      // Simple single-part email
      const bodyStart =
        emlContent.indexOf('\r\n\r\n') !== -1
          ? emlContent.indexOf('\r\n\r\n') + 4
          : emlContent.indexOf('\n\n') + 2;
      const raw = emlContent.slice(bodyStart);
      const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(emlContent.slice(0, bodyStart));
      const isBase64 = /content-transfer-encoding:\s*base64/i.test(emlContent.slice(0, bodyStart));
      const isHtml = /content-type:\s*text\/html/i.test(emlContent.slice(0, bodyStart));
      let decoded = raw;
      if (isBase64) {
        try { decoded = decodeBase64Utf8(raw); } catch { /* keep raw */ }
      } else if (isQP) {
        decoded = decodeQuotedPrintable(raw);
      }
      if (isHtml) return decoded;
      return `<pre style="white-space:pre-wrap;font-family:inherit">${decoded}</pre>`;
    }

    const result = extractBodyFromParts(emlContent, boundaryMatch[1]);
    if (result) return result;

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
        <Space orientation="vertical" size={0}>
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
              orientation="vertical"
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
                <div>
                  {viewing.attachments.map((att: Attachment) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--ant-color-split, #f0f0f0)' }}>
                      <Space
                        orientation="vertical"
                        size={4}
                        style={{ width: "100%", flex: 1, minWidth: 0 }}
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
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        href={downloadUrl(att.id)}
                        download={att.filename}
                        style={{ flexShrink: 0, marginLeft: 8 }}
                      >
                        {t('common.download')}
                      </Button>
                    </div>
                  ))}
                </div>
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
