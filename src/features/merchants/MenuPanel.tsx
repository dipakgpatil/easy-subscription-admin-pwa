import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ImagePlus, LoaderCircle, PackagePlus, Plus, Search, Trash2, X } from 'lucide-react'

import {
  assignProductToMerchant,
  bulkAssignProductsToMerchant,
  createCatalogProduct,
  getMerchantMenu,
  removeMerchantMenuItem,
  searchCatalogProducts,
  uploadProductImage,
} from '../../lib/api'
import type { AdminCatalogProductRow, AdminMerchantMenuItem, AdminMerchantProfile } from '../../lib/types'
import { deriveProductCode, formatMoney } from './merchantUtils'

type Props = {
  token: string
  merchant: AdminMerchantProfile
  onChanged: () => void
}

type Mode = 'list' | 'add' | 'create'

export default function MenuPanel({ token, merchant, onChanged }: Props) {
  const [items, setItems] = useState<AdminMerchantMenuItem[] | null>(null)
  const [mode, setMode] = useState<Mode>('list')
  const [query, setQuery] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const load = useCallback(async () => {
    try {
      setItems(await getMerchantMenu(token, merchant.merchant_uid))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the menu.')
    }
  }, [merchant.merchant_uid, token])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase()
    return (items ?? []).filter(
      (item) =>
        !term ||
        `${item.product_description} ${item.product_code} ${item.category_description ?? ''}`.toLowerCase().includes(term),
    )
  }, [deferredQuery, items])

  async function update(item: AdminMerchantMenuItem, change: { activeYn?: 'Y' | 'N'; prep?: number; price?: string | null }) {
    setBusyCode(item.product_code)
    setError(null)
    try {
      const price = change.price !== undefined ? change.price : item.price_override
      await assignProductToMerchant(token, item.product_code, {
        merchantUid: merchant.merchant_uid,
        prepTimeMinutes: change.prep ?? item.prep_time_minutes,
        activeYn: change.activeYn ?? item.active_yn,
        priceOverride: price ?? undefined,
      })
      await load()
      if (change.activeYn) onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this item.')
    } finally {
      setBusyCode(null)
    }
  }

  async function remove(item: AdminMerchantMenuItem) {
    if (!window.confirm(`Remove ${item.product_description} from ${merchant.display_name}'s menu?`)) return
    setBusyCode(item.product_code)
    setError(null)
    try {
      setItems(await removeMerchantMenuItem(token, merchant.merchant_uid, item.product_code))
      setMessage(`${item.product_description} removed.`)
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove this item.')
    } finally {
      setBusyCode(null)
    }
  }

  const onMenu = new Set((items ?? []).map((item) => item.product_code))

  return (
    <section className="panel">
      <div className="merchant-list-toolbar">
        <div>
          <p className="section-kicker">Menu</p>
          <h2>
            {mode === 'add'
              ? 'Add products from the catalog'
              : mode === 'create'
                ? 'Create a new product'
                : items
                  ? `${items.length} item${items.length === 1 ? '' : 's'}`
                  : 'Menu'}
          </h2>
        </div>
        <div className="merchant-list-tools">
          {mode === 'list' ? (
            <>
              <label className="merchant-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this menu" />
              </label>
              <button className="ghost-button" type="button" onClick={() => setMode('create')}>
                <PackagePlus size={16} /> New product
              </button>
              <button className="primary-button" type="button" onClick={() => setMode('add')}>
                <Plus size={16} /> Add from catalog
              </button>
            </>
          ) : (
            <button className="ghost-button" type="button" onClick={() => setMode('list')}>
              <X size={16} /> Back to menu
            </button>
          )}
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {message && mode === 'list' ? <p className="success-banner">{message}</p> : null}

      {mode === 'add' ? (
        <AddFromCatalog
          token={token}
          merchant={merchant}
          onMenu={onMenu}
          onAdded={async (count) => {
            await load()
            onChanged()
            setMessage(`${count} item${count === 1 ? '' : 's'} added to the menu.`)
            setMode('list')
          }}
        />
      ) : null}

      {mode === 'create' ? (
        <CreateProduct
          token={token}
          merchant={merchant}
          onCreated={async (name) => {
            await load()
            onChanged()
            setMessage(`${name} created and added to the menu.`)
            setMode('list')
          }}
        />
      ) : null}

      {mode === 'list' ? (
        <div className="menu-table" role="table" aria-label="Menu items">
          <div className="menu-row menu-head" role="row">
            <span>Item</span>
            <span>Price</span>
            <span>Prep (min)</span>
            <span>Available</span>
            <span aria-hidden="true" />
          </div>
          {visible.map((item) => (
            // Remount on change so the inline inputs show the saved values.
            <div
              key={`${item.product_code}:${item.price_override ?? ''}:${item.prep_time_minutes}`}
              className={item.active_yn === 'Y' ? 'menu-row' : 'menu-row is-off'}
              role="row"
            >
              <span className="menu-item">
                {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="menu-thumb" aria-hidden="true" />}
                <span>
                  <strong>{item.product_description}</strong>
                  <span className="muted-line">{item.category_description ?? 'Uncategorised'} · {item.product_code}</span>
                </span>
              </span>
              <PriceCell item={item} disabled={busyCode !== null} onSave={(price) => void update(item, { price })} />
              <input
                className="menu-number"
                type="number"
                min={1}
                max={180}
                defaultValue={item.prep_time_minutes}
                disabled={busyCode !== null}
                aria-label={`Prep time for ${item.product_description}`}
                onBlur={(event) => {
                  const prep = Number(event.target.value)
                  if (Number.isInteger(prep) && prep >= 1 && prep <= 180 && prep !== item.prep_time_minutes) void update(item, { prep })
                }}
              />
              <label className="menu-switch">
                <input
                  type="checkbox"
                  checked={item.active_yn === 'Y'}
                  disabled={busyCode !== null}
                  onChange={(event) => void update(item, { activeYn: event.target.checked ? 'Y' : 'N' })}
                />
                <span>{busyCode === item.product_code ? <LoaderCircle className="is-spinning" size={14} /> : item.active_yn === 'Y' ? 'On' : 'Off'}</span>
              </label>
              <button
                className="ghost-button danger-button merchant-icon-button"
                type="button"
                onClick={() => void remove(item)}
                disabled={busyCode !== null}
                aria-label={`Remove ${item.product_description}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {items && items.length === 0 ? (
            <p className="muted-line">The menu is empty. Use <strong>Add from catalog</strong> or <strong>New product</strong>.</p>
          ) : null}
          {items && items.length > 0 && visible.length === 0 ? <p className="muted-line">No items match.</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function PriceCell({ item, disabled, onSave }: { item: AdminMerchantMenuItem; disabled: boolean; onSave: (price: string | null) => void }) {
  return (
    <span className="menu-price">
      <input
        className="menu-number"
        type="number"
        min={0}
        step="0.01"
        defaultValue={item.price_override ?? ''}
        placeholder={item.base_price ?? ''}
        disabled={disabled}
        aria-label={`Price for ${item.product_description}`}
        onBlur={(event) => {
          const raw = event.target.value.trim()
          const next = raw === '' ? null : Number(raw).toFixed(2)
          if (next !== (item.price_override ? Number(item.price_override).toFixed(2) : null)) onSave(next)
        }}
      />
      <span className="muted-line">{item.price_override ? `Catalog ${formatMoney(item.base_price)}` : 'Catalog price'}</span>
    </span>
  )
}

function AddFromCatalog({
  token,
  merchant,
  onMenu,
  onAdded,
}: {
  token: string
  merchant: AdminMerchantProfile
  onMenu: Set<string>
  onAdded: (count: number) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<AdminCatalogProductRow[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      searchCatalogProducts(token, deferredQuery, 60)
        .then((result) => !cancelled && setRows(result))
        .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : 'Search failed.'))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [deferredQuery, token])

  const available = (rows ?? []).filter((row) => !onMenu.has(row.product_code) && row.product_code !== 'DELIVERY')

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await bulkAssignProductsToMerchant(token, {
        merchantUid: merchant.merchant_uid,
        productCodes: [...picked],
        prepTimeMinutes: merchant.default_prep_minutes || 15,
      })
      await onAdded(picked.size)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add these products.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="catalog-picker">
      <label className="merchant-search catalog-picker-search">
        <Search size={16} aria-hidden="true" />
        <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the catalog by name or code" />
      </label>
      {error ? <p className="error-banner">{error}</p> : null}
      <div className="catalog-picker-list">
        {rows === null ? <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Searching…</p> : null}
        {available.map((row) => (
          <label key={row.product_code} className={picked.has(row.product_code) ? 'catalog-pick is-picked' : 'catalog-pick'}>
            <input
              type="checkbox"
              checked={picked.has(row.product_code)}
              onChange={() =>
                setPicked((current) => {
                  const next = new Set(current)
                  if (next.has(row.product_code)) next.delete(row.product_code)
                  else next.add(row.product_code)
                  return next
                })
              }
            />
            {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <span className="menu-thumb" aria-hidden="true" />}
            <span className="catalog-pick-text">
              <strong>{row.name}</strong>
              <span className="muted-line">
                {row.category_description ?? 'Uncategorised'} · {formatMoney(row.base_price)} · on {row.merchant_count} menu{row.merchant_count === 1 ? '' : 's'}
              </span>
            </span>
          </label>
        ))}
        {rows && available.length === 0 ? <p className="muted-line">Nothing new to add for this search.</p> : null}
      </div>
      <div className="merchant-form-actions">
        <button className="primary-button" type="button" onClick={() => void add()} disabled={busy || picked.size === 0}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Plus size={16} />}
          {picked.size ? `Add ${picked.size} to menu` : 'Select products to add'}
        </button>
      </div>
    </div>
  )
}

function CreateProduct({
  token,
  merchant,
  onCreated,
}: {
  token: string
  merchant: AdminMerchantProfile
  onCreated: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [prep, setPrep] = useState(String(merchant.default_prep_minutes || 15))
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(price)
    if (!name.trim() || !category.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a name, a category and a price above zero.')
      return
    }
    setBusy(true)
    setError(null)
    const productCode = deriveProductCode(name)
    try {
      const imageUrl = image ? (await uploadProductImage(token, { productCode, file: image })).url : undefined
      await createCatalogProduct(token, {
        productCode,
        productName: name.trim(),
        categoryName: category.trim(),
        price: amount.toFixed(2),
        imageUrl,
        description: description.trim() || undefined,
      })
      await assignProductToMerchant(token, productCode, {
        merchantUid: merchant.merchant_uid,
        prepTimeMinutes: Number(prep) || 15,
        activeYn: 'Y',
      })
      await onCreated(name.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the product.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="merchant-form-grid" onSubmit={submit}>
      <label>Product name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} placeholder="Kolhapuri Misal Pav" /></label>
      <label>Price (₹)<input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min={1} step="0.01" required /></label>
      <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} required maxLength={120} placeholder="Breakfast" /></label>
      <label>Prep time (min)<input value={prep} onChange={(event) => setPrep(event.target.value)} type="number" min={1} max={180} /></label>
      <label className="merchant-form-wide">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Optional" /></label>
      <label className="merchant-form-wide">
        <span><ImagePlus size={14} /> Photo (optional)</span>
        <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
      </label>
      {error ? <p className="error-banner merchant-form-wide">{error}</p> : null}
      <div className="merchant-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <PackagePlus size={16} />} Create and add to menu
        </button>
      </div>
    </form>
  )
}
