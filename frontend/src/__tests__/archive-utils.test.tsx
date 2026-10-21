import { render } from '@testing-library/react'
import i18n from '../i18n'
import { Highlight, highlightParts } from '../components/app/Highlight'
import { labelTreeNodes } from '../components/app/LabelTree'

beforeAll(() => i18n.changeLanguage('fr'))

describe('highlight', () => {
  it('only <mark> becomes an element; escaped tags stay text and entities are decoded once', () => {
    const html = 'a &lt;script&gt;alert(1)&lt;/script&gt; <mark>EDF</mark> &amp;lt; &quot;x&quot; &#39;y&#39; <b>z</b>'
    expect(highlightParts(html)).toEqual([
      { text: 'a <script>alert(1)</script> ', mark: false },
      { text: 'EDF', mark: true },
      { text: ' &lt; "x" \'y\' <b>z</b>', mark: false },
    ])
    const { container } = render(<p><Highlight html={html} /></p>)
    expect(container.querySelectorAll('mark')).toHaveLength(1)
    expect(container.querySelector('script, b')).toBeNull()
    expect(container.textContent).toBe('a <script>alert(1)</script> EDF &lt; "x" \'y\' <b>z</b>')
  })
})

describe('labelTreeNodes', () => {
  it('nests by « / » under the closest archived ancestor', () => {
    const nodes = labelTreeNodes([
      { id: 'a', name: 'A', type: 'user', archived_count: 1 },
      { id: 'abc', name: 'A/B/C', type: 'user', archived_count: 2 },
      { id: 'x', name: 'X/Y', type: 'user', archived_count: 3 },
      { id: 'SENT', name: 'SENT', type: 'system', archived_count: 4 },
      { id: 'z', name: 'Z', type: 'user', archived_count: 0 },
    ], i18n.t, 10)
    expect(nodes.map(({ name, level, count }) => [name, level, count])).toEqual([
      ['Tous les mails', 1, 10], ['A', 1, 1], ['B/C', 2, 2], ['Envoyés', 1, 4], ['X/Y', 1, 3],
    ])
  })
})
