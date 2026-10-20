import { useEffect, useMemo, useState } from "react";
import {
  Table,
  Space,
  Button,
  Tag,
  Typography,
  message,
  Card,
  Dropdown,
  App,
  Spin,
  Tooltip,
  Select,
} from "antd";
import { RefreshCw, Filter, Paperclip, MoreHorizontal, Save, Star, Mail } from 'lucide-react'
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
import { useQueryClient } from '@tanstack/react-query';
import { useGmailLabels, useGmailMessages, queryKeys } from '../hooks/queries';
import dayjs from "dayjs";

const { Text, Title } = Typography;

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
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const { data: labels = [] } = useGmailLabels(accountId);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // query = search box draft; searchQuery = submitted search that drives the list
  const [query, setQuery] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [quickFilter, setQuickFilter] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();

  const {
    data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch,
  } = useGmailMessages(accountId, searchQuery, quickFilter);
  const mails: MailRow[] = useMemo(() => data?.pages.flatMap((p) => p.mails) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const invalidateMails = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.gmailMessages(accountId!, searchQuery, quickFilter) });

  // Follow ?q= when it changes while the page stays mounted (e.g. opening a saved search)
  useEffect(() => {
    setQuery(urlQuery);
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  // Selection belongs to one list: drop it when the account or the search changes
  useEffect(() => {
    setSelected([]);
    setFocusedIndex(-1);
  }, [accountId, searchQuery, quickFilter]);

  useEffect(() => {
    if (error) messageApi.error(t('mailManager.loadError'));
  }, [error]);

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

  // Sentinel div en bas de liste → IntersectionObserver
  const sentinelRef = useInfiniteScroll({
    onLoadMore: () => void fetchNextPage(),
    hasMore: !!hasNextPage,
    loading: isFetchingNextPage,
  });

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
        message: t('mailManager.archiveAllStarted'),
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
  const handleBulkAction = async (action: string, labelId?: string, ids: string[] = selected) => {
    if (!ids.length || !accountId) return;

    if (action === "archive_nas") {
      setBulkLoading(true);
      try {
        const { jobId } = await archiveApi.triggerArchive(accountId, {
          messageIds: ids,
          differential: true,
        });
        setActiveJobId(jobId);
        notification.success({
          message: t('mailManager.archiveAllStarted'),
          description: t('mailManager.archiveAllDesc'),
        });
        setSelected([]);
      } catch {
        messageApi.error(t('mailManager.bulkError'));
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
        ids,
        labelId,
      );
      setActiveJobId(jobId);
      notification.success({
        message: t('mailManager.bulkStarted'),
        description: t('mailManager.bulkStartedDesc', { count: ids.length }),
      });
      setSelected([]);
    } catch {
      messageApi.error(t('mailManager.bulkError'));
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
              <Paperclip size={14} style={{ color: "#8c8c8c", fontSize: 12 }} />
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
              {key: "read", label: t('mailManager.read')},
              {key: "trash", label: t('mailManager.trashAction')},
              {key: "archive", label: t('mailManager.archiveGmail')},
              {key: "archive_nas", label: t('mailManager.archiveNas')},
            ],
            // Row actions target this row, not the checked selection; stopPropagation keeps the row click from opening the viewer
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === "read") setViewingId(row.id);
              else void handleBulkAction(key, undefined, [row.id]);
            },
          }}
        >
          <Button type="text" icon={<MoreHorizontal size={14} />} size="small" onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Mail size={20} />
        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>{t('mailManager.title')}</Title>
      </div>

      {/* Filtres */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select
            style={{ width: 190 }}
            value={quickFilter}
            onChange={(v) => {
              setQuickFilter(v);
            }}
            options={QUICK_FILTERS_KEYS.map(f => ({ label: f.labelKey === 'all' ? t('mailManager.inbox') : t(`mailManager.${f.labelKey}`), value: f.value }))}
            prefix={<Filter size={14} />}
          />
          <GmailSearchInput
            value={query}
            onChange={setQuery}
            onSearch={(v) => (v === searchQuery ? void refetch() : setSearchQuery(v))}
            style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 400 }}
          />
          <Button
            icon={<RefreshCw size={14} />}
            aria-label={t('common.refresh')}
            onClick={() => void refetch()}
            loading={isFetching && !isFetchingNextPage}
          />
          <Button
            icon={<Save size={14} />}
            type="primary"
            onClick={handleArchiveAll}
            loading={archiveAllLoading}
          >
            {t('mailManager.archiveAll')}
          </Button>
          {(query || quickFilter) && (
            <Tooltip title={t('mailManager.saveSearch')}>
              <Button
                icon={<Star size={14} />}
                onClick={handleSaveSearch}
              />
            </Tooltip>
          )}
          {total > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ~{total.toLocaleString()} {t('mailManager.results', { total, loaded: mails.length }).split('·').pop()}
            </Text>
          )}
        </div>
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
        loading={isLoading}
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
        {isFetchingNextPage && <Spin size="small" />}
        {!hasNextPage && mails.length > 0 && (
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
        onClose={() => {
          setActiveJobId(null);
          // Bulk/archive jobs run in the background: by the time the progress modal closes they have changed the list
          void invalidateMails();
        }}
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
