import { useState, useRef } from 'react'
import { AutoComplete, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

// Opérateurs Gmail natifs avec description
const OPERATOR_SUGGESTIONS = [
  { value: 'from:',           label: 'from: — Expéditeur' },
  { value: 'to:',             label: 'to: — Destinataire' },
  { value: 'subject:',        label: 'subject: — Sujet' },
  { value: 'has:attachment',  label: 'has:attachment — Avec pièce jointe' },
  { value: 'has:drive',       label: 'has:drive — Avec Google Drive' },
  { value: 'larger:',         label: 'larger: — Plus grand que (ex: larger:5m)' },
  { value: 'smaller:',        label: 'smaller: — Plus petit que' },
  { value: 'older_than:',     label: 'older_than: — Plus vieux que (ex: 1y, 6m, 30d)' },
  { value: 'newer_than:',     label: 'newer_than: — Plus récent que' },
  { value: 'in:inbox',        label: 'in:inbox — Dans la boîte de réception' },
  { value: 'in:spam',         label: 'in:spam — Dans le spam' },
  { value: 'in:trash',        label: 'in:trash — Dans la corbeille' },
  { value: 'in:sent',         label: 'in:sent — Envoyés' },
  { value: 'is:unread',       label: 'is:unread — Non lus' },
  { value: 'is:read',         label: 'is:read — Lus' },
  { value: 'is:starred',      label: 'is:starred — Suivis' },
  { value: 'is:important',    label: 'is:important — Importants' },
  { value: 'label:',          label: 'label: — Par label' },
  { value: 'category:promotions',  label: 'category:promotions — Promotions' },
  { value: 'category:social',      label: 'category:social — Réseaux sociaux' },
  { value: 'category:updates',     label: 'category:updates — Mises à jour' },
  { value: 'category:forums',      label: 'category:forums — Forums' },
  { value: 'filename:',       label: 'filename: — Nom de pièce jointe' },
  { value: 'after:',          label: 'after: — Après date (ex: after:2024/01/01)' },
  { value: 'before:',         label: 'before: — Avant date' },
]

interface Props {
  value:        string
  onChange:     (v: string) => void
  onSearch:     (v: string) => void
  placeholder?: string
  style?:       React.CSSProperties
}

export default function GmailSearchInput({ value, onChange, onSearch, placeholder, style }: Props) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])

  const handleSearch = (input: string) => {
    // Extraire le dernier token (après le dernier espace)
    const tokens    = input.split(/\s+/)
    const lastToken = tokens[tokens.length - 1].toLowerCase()

    if (!lastToken) {
      setOptions([])
      return
    }

    const matches = OPERATOR_SUGGESTIONS.filter((op) =>
      op.value.toLowerCase().startsWith(lastToken) ||
      op.label.toLowerCase().includes(lastToken)
    ).slice(0, 8)

    setOptions(
      matches.map((op) => ({
        // Remplacer le dernier token par l'opérateur sélectionné
        value: [...tokens.slice(0, -1), op.value].join(' '),
        label: op.label,
      }))
    )
  }

  const handleSelect = (v: string) => {
    onChange(v)
    setOptions([])
  }

  return (
    <AutoComplete
      style={style}
      value={value}
      options={options}
      onSearch={(v) => { onChange(v); handleSearch(v) }}
      onSelect={handleSelect}
      dropdownMatchSelectWidth={420}
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder={placeholder ?? 'from:, has:attachment, larger:5m…'}
        onPressEnter={() => onSearch(value)}
        allowClear
      />
    </AutoComplete>
  )
}
