import { useState } from "react";
import { AutoComplete, Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

// Operator keys mapped to translation keys and values
const OPERATOR_KEYS = [
  { value: "from:", key: "from" },
  { value: "to:", key: "to" },
  { value: "subject:", key: "subject" },
  { value: "has:attachment", key: "hasAttachment" },
  { value: "has:drive", key: "hasDrive" },
  { value: "larger:", key: "larger" },
  { value: "smaller:", key: "smaller" },
  { value: "older_than:", key: "olderThan" },
  { value: "newer_than:", key: "newerThan" },
  { value: "in:inbox", key: "inInbox" },
  { value: "in:spam", key: "inSpam" },
  { value: "in:trash", key: "inTrash" },
  { value: "in:sent", key: "inSent" },
  { value: "is:unread", key: "isUnread" },
  { value: "is:read", key: "isRead" },
  { value: "is:starred", key: "isStarred" },
  { value: "is:important", key: "isImportant" },
  { value: "label:", key: "label" },
  { value: "category:promotions", key: "promotions" },
  { value: "category:social", key: "social" },
  { value: "category:updates", key: "updates" },
  { value: "category:forums", key: "forums" },
  { value: "filename:", key: "filename" },
  { value: "after:", key: "after" },
  { value: "before:", key: "before" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSearch: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function GmailSearchInput({
  value,
  onChange,
  onSearch,
  placeholder,
  style,
}: Props) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    [],
  );

  const operatorSuggestions = OPERATOR_KEYS.map((op) => ({
    value: op.value,
    label: `${op.value} — ${t('operators.' + op.key)}`,
  }));

  const handleSearch = (input: string) => {
    // Extraire le dernier token (après le dernier espace)
    const tokens = input.split(/\s+/);
    const lastToken = tokens[tokens.length - 1].toLowerCase();

    if (!lastToken) {
      setOptions([]);
      return;
    }

    const matches = operatorSuggestions.filter(
      (op) =>
        op.value.toLowerCase().startsWith(lastToken) ||
        op.label.toLowerCase().includes(lastToken),
    ).slice(0, 8);

    setOptions(
      matches.map((op) => ({
        // Remplacer le dernier token par l'opérateur sélectionné
        value: [...tokens.slice(0, -1), op.value].join(" "),
        label: op.label,
      })),
    );
  };

  const handleSelect = (v: string) => {
    onChange(v);
    setOptions([]);
  };

  return (
    <AutoComplete
      style={style}
      value={value}
      options={options}
      onSearch={(v) => {
        onChange(v);
        handleSearch(v);
      }}
      onSelect={handleSelect}
      dropdownMatchSelectWidth={420}
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder={placeholder ?? "from:, has:attachment, larger:5m…"}
        onPressEnter={() => onSearch(value)}
        allowClear
      />
    </AutoComplete>
  );
}
