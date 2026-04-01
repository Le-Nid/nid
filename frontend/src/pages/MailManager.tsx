import { useEffect, useState, useCallback, useRef } from "react";
import {
  Table,
  Space,
  Button,
  Tag,
  Typography,
  message,
  Card,
  Dropdown,
  notification,
  Spin,
  Tooltip,
  Select,
} from "antd";
import {
  ReloadOutlined,
  FilterOutlined,
  PaperClipOutlined,
  MoreOutlined,
  SaveOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router";
import { gmailApi, archiveApi, savedSearchesApi } from "../api";
import { useAccount } from "../hooks/useAccount";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { formatBytes, formatSender } from "../utils/format";
import BulkActionBar from "../components/BulkActionBar";
import MailViewer from "../components/MailViewer";
import GmailSearchInput from "../components/GmailSearchInput";
import JobProgressModal from "../components/JobProgressModal";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTranslation } from 'react-i18next';
import { useMailCache, cacheKey } from '../store/mail.store';
import { useGmailLabels } from '../hooks/queries';
import dayjs from "dayjs";

const { Text } = Typography;

const QUICK_FILTERS_KEYS = [
  { labelKey: 'all', value: '' },
  { labelKey: 'unread', value: 'is:unread' },
  { labelKey: 'withAttachment', value: 'has:attachment' },
  { labelKey: 'large', value: 'larger:5m' },
  { labelKey: 'promotions', value: 'category:promotions' },
  { labelKey: 'social', value: 'category:social' },
  { labelKey: 'spam', value: 'in:spam' },
  { labelKey: 'trash', value: 'in:trash' },
  { labelKey: 'olderThan1y', value: 'older_than:1y' },
];

interface MailRow {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  sizeEstimate: number;
  snippet: string;
  labelIds: string[];
  hasAttachments: boolean;
}

export default function MailManagerPage() {
  const { t } = useTranslation();
  const { accountId } = useAccount();
  const mailCache = useMailCache();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  // Restaurer l'état depuis le cache Zustand au montage (évite le flash vide)
  const initialKey = accountId ? cacheKey(accountId, urlQuery, '') : '';
  const initialCache = initialKey ? mailCache.getEntry(initialKey) : null;

  const [mails, setMails] = useState<MailRow[]>(initialCache?.mails ?? []);
  const { data: labels = [] } = useGmailLabels(accountId);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(urlQuery);
  const [quickFilter, setQuickFilter] = useState("");
  const [pageToken, setPageToken] = useState<string | null>(initialCache?.pageToken ?? null);
  const [hasMore, setHasMore] = useState(initialCache?.hasMore ?? false);
  const [total, setTotal] = useState(initialCache?.total ?? 0);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const loadIdRef = useRef(0);

  const PROGRESSIVE_BATCH = 5;

  // ─── Raccourcis clavier ───────────────────────────────────
  useKeyboardShortcuts({
    mails,
    selectedIndex: focusedIndex,
    onSelectIndex: (i) => {
      setFocusedIndex(i);
      if (i >= 0 && mails[i]) {
        setSelected([mails[i].id]);
      } else {
        setSelected([]);
      }
    },
    onViewMail: (id) => setViewingId(id),
    onAction: (action) => {
      if (selected.length > 0) handleBulkAction(action);
    },
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>('.gmail-search-input input');
      input?.focus();
    },
    enabled: !viewingId,
  });

  // ─── Chargement initial (progressif + cache) ─────────────
  const loadFresh = useCallback(async (forceRefresh = false) => {
    if (!accountId) return;

    const currentLoadId = ++loadIdRef.current;
    const key = cacheKey(accountId, query, quickFilter);
    const cached = mailCache.getEntry(key);

    // Restaurer le cache immédiatement
    if (cached && !forceRefresh) {
      setMails(cached.mails);
      setTotal(cached.total);
      setPageToken(cached.pageToken);
      setHasMore(cached.hasMore);
      return;
    }

    setLoading(true);
    if (!cached) setMails([]);
    setSelected([]);
    setPageToken(null);
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(" ");
      const res = await gmailApi.listMessages(accountId, {
        q: fullQuery || undefined,
        maxResults: 20,
      });

      if (currentLoadId !== loadIdRef.current) return;

      const ids: string[] = (res.messages ?? []).map((m: any) => m.id);
      setTotal(res.resultSizeEstimate ?? 0);

      // Chargement en une seule requête (le backend gère la concurrence)
      const allMails: MailRow[] = [];
      if (!cached) setMails([]);

      for (let i = 0; i < ids.length; i += PROGRESSIVE_BATCH) {
        const chunk = ids.slice(i, i + PROGRESSIVE_BATCH);
        const enriched = await gmailApi.batchGetMessages(accountId, chunk);

        if (currentLoadId !== loadIdRef.current) return;

        allMails.push(...enriched);
        setMails([...allMails]);
        if (i === 0) setLoading(false);
      }

      setPageToken(res.nextPageToken ?? null);
      setHasMore(!!res.nextPageToken);

      // Mettre en cache
      mailCache.setEntry(key, {
        mails: allMails,
        total: res.resultSizeEstimate ?? 0,
        pageToken: res.nextPageToken ?? null,
        hasMore: !!res.nextPageToken,
      });
    } catch {
      if (currentLoadId === loadIdRef.current) {
        messageApi.error(t('mailManager.loadError'));
      }
    } finally {
      if (currentLoadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  }, [accountId, query, quickFilter]);

  // ─── Charger la page suivante (infinite scroll, progressif) ─
  const loadMore = useCallback(async () => {
    if (!accountId || !pageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(" ");
      const res = await gmailApi.listMessages(accountId, {
        q: fullQuery || undefined,
        maxResults: 20,
        pageToken,
      });

      const ids: string[] = (res.messages ?? []).map((m: any) => m.id);

      // Chargement séquentiel par lots
      for (let i = 0; i < ids.length; i += PROGRESSIVE_BATCH) {
        const chunk = ids.slice(i, i + PROGRESSIVE_BATCH);
        const enriched = await gmailApi.batchGetMessages(accountId, chunk);
        setMails((prev) => [...prev, ...enriched]);
      }

      setPageToken(res.nextPageToken ?? null);
      setHasMore(!!res.nextPageToken);

      // Mettre à jour le cache avec les nouvelles données
      const key = cacheKey(accountId, query, quickFilter);
      setMails((currentMails) => {
        mailCache.setEntry(key, {
          mails: currentMails,
          total,
          pageToken: res.nextPageToken ?? null,
          hasMore: !!res.nextPageToken,
        });
        return currentMails;
      });
    } catch {
      messageApi.error(t('dashboard.loadError'));
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, pageToken, query, quickFilter, loadingMore, total]);

  // Sentinel div en bas de liste → IntersectionObserver
  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
  });

  useEffect(() => {
    // Increment loadId — any in-flight loadFresh from a previous mount
    // will see the mismatch and bail out before processing results.
    loadIdRef.current++;
    loadFresh();
  }, [accountId, quickFilter]);

  // ─── Archive all (differential) ────────────────────────
  const handleArchiveAll = async () => {
    if (!accountId) return;
    setArchiveAllLoading(true);
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(' ') || undefined;
      const { jobId } = await archiveApi.triggerArchive(accountId, {
        query: fullQuery,
        differential: true,
      });
      setActiveJobId(jobId);
      notification.success({
        title: t('mailManager.archiveAllStarted'),
        description: t('mailManager.archiveAllDesc'),
      });
    } catch {
      messageApi.error(t('mailManager.loadError'));
    } finally {
      setArchiveAllLoading(false);
    }
  };

  // ─── Sauvegarder la recherche courante ────────────────────
  const handleSaveSearch = async () => {
    const fullQuery = [quickFilter, query].filter(Boolean).join(' ');
    if (!fullQuery.trim()) return;
    try {
      await savedSearchesApi.create({ name: fullQuery.slice(0, 60), query: fullQuery });
      messageApi.success(t('mailManager.searchSaved'));
    } catch {
      messageApi.error(t('common.error'));
    }
  };

  // ─── Bulk actions ─────────────────────────────────────────
  const handleBulkAction = async (action: string, labelId?: string) => {
    if (!selected.length || !accountId) return;

    if (action === "archive_nas") {
      setBulkLoading(true);
      try {
        const { jobId } = await archiveApi.triggerArchive(accountId, {
          messageIds: selected,
          differential: true,
        });
        setActiveJobId(jobId);
        notification.success({
          title: "Archivage lancé",
          description: `Job créé — suivi temps réel disponible.`,
        });
        setSelected([]);
      } finally {
        setBulkLoading(false);
      }
      return;
    }

    setBulkLoading(true);
    try {
      const { jobId } = await gmailApi.bulkOperation(
        accountId,
        action,
        selected,
        labelId,
      );
      setActiveJobId(jobId);
      notification.success({
        title: "Opération lancée",
        description: `${selected.length} mail(s) — suivi dans Jobs.`,
      });
      setSelected([]);
      setTimeout(loadFresh, 3000);
    } catch {
      messageApi.error("Erreur lors de l'opération");
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── Colonnes ─────────────────────────────────────────────
  const columns = [
    {
      title: t('mailManager.sender'),
      dataIndex: "from",
      width: 195,
      ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Text
          strong={row.labelIds.includes("UNREAD")}
          ellipsis
          style={{ fontSize: 13, maxWidth: 180, display: "block" }}
        >
          {formatSender(v)}
        </Text>
      ),
    },
    {
      title: t('mailManager.subject'),
      dataIndex: "subject",
      ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Space orientation="vertical" size={0}>
          <Space size={4}>
            {row.hasAttachments && (
              <PaperClipOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
            )}
            <Text
              strong={row.labelIds.includes("UNREAD")}
              style={{ fontSize: 13 }}
            >
              {v || t('common.noSubject')}
            </Text>
          </Space>
          <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
            {row.snippet}
          </Text>
        </Space>
      ),
    },
    {
      title: t('mailManager.labels'),
      dataIndex: "labelIds",
      width: 160,
      render: (ids: string[]) => (
        <Space size={2} wrap>
          {ids
            .filter((id) => !["UNREAD", "IMPORTANT", "STARRED"].includes(id))
            .slice(0, 3)
            .map((id) => {
              const label = labels.find((l: any) => l.id === id);
              return (
                <Tag key={id} style={{ fontSize: 10, padding: "0 4px" }}>
                  {label?.name ?? id}
                </Tag>
              );
            })}
        </Space>
      ),
    },
    {
      title: t('mailManager.size'),
      dataIndex: "sizeEstimate",
      width: 80,
      sorter: (a: MailRow, b: MailRow) => a.sizeEstimate - b.sizeEstimate,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatBytes(v)}
        </Text>
      ),
    },
    {
      title: t('mailManager.date'),
      dataIndex: "date",
      width: 95,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format("DD/MM/YY") : "—"}
        </Text>
      ),
    },
    {
      title: "",
      width: 40,
      render: (_: any, row: MailRow) => (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              {key: "read", label: t('mailManager.read'), onClick: () => setViewingId(row.id)},
              {key: "trash", label: t('mailManager.trashAction'), onClick: () => handleBulkAction("trash")},
              {key: "archive", label: t('mailManager.archiveGmail'), onClick: () => handleBulkAction("archive")},
              {key: "nas", label: t('mailManager.archiveNas'), onClick: () => handleBulkAction("archive_nas")},
            ],
          }}
        >
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}

      {/* Filtres */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            style={{ width: 190 }}
            value={quickFilter}
            onChange={(v) => {
              setQuickFilter(v);
            }}
            options={QUICK_FILTERS_KEYS.map(f => ({ label: f.labelKey === 'all' ? t('mailManager.inbox') : t(`mailManager.${f.labelKey}`), value: f.value }))}
            prefix={<FilterOutlined />}
          />
          <GmailSearchInput
            value={query}
            onChange={setQuery}
            onSearch={() => loadFresh(true)}
            style={{ width: 400 }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadFresh(true)}
            loading={loading}
          />
          <Button
            icon={<SaveOutlined />}
            type="primary"
            onClick={handleArchiveAll}
            loading={archiveAllLoading}
          >
            {t('mailManager.archiveAll')}
          </Button>
          {(query || quickFilter) && (
            <Tooltip title={t('mailManager.saveSearch')}>
              <Button
                icon={<StarOutlined />}
                onClick={handleSaveSearch}
              />
            </Tooltip>
          )}
          {total > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ~{total.toLocaleString()} {t('mailManager.results', { total, loaded: mails.length }).split('·').pop()}
            </Text>
          )}
        </Space>
      </Card>

      {/* Bulk bar */}
      <BulkActionBar
        selected={selected}
        labels={labels}
        onBulkAction={handleBulkAction}
        loading={bulkLoading}
      />

      {/* Table */}
      <Table
        dataSource={mails}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ x: 800 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
        }}
        onRow={(row, index) => ({
          onClick: () => setViewingId(row.id),
          style: {
            cursor: "pointer",
            fontWeight: row.labelIds.includes("UNREAD") ? 600 : 400,
            background: index === focusedIndex ? 'rgba(24, 144, 255, 0.08)' : undefined,
          },
        })}
        locale={{ emptyText: t('mailManager.noMail') }}
      />

      {/* Sentinel infinite scroll */}
      <div
        ref={sentinelRef}
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loadingMore && <Spin size="small" />}
        {!hasMore && mails.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            — {t('mailManager.allLoaded')} —
          </Text>
        )}
      </div>

      {/* Mail viewer */}
      <MailViewer
        accountId={accountId!}
        messageId={viewingId}
        onClose={() => setViewingId(null)}
      />

      {/* Job progress SSE */}
      <JobProgressModal
        jobId={activeJobId}
        onClose={() => setActiveJobId(null)}
      />

      {/* Keyboard shortcuts hint */}
      <div style={{ textAlign: 'center', marginTop: 8, opacity: 0.5 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('mailManager.shortcuts')}
        </Text>
      </div>
    </div>
  );
}
