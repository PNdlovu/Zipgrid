/**
 * @file page.tsx
 * @description Driver vehicles page — add, view, and manage registered EVs.
 * Each vehicle stores make, model, year, connector type, and max range.
 * Vehicles are required to create a booking.
 *
 * @module apps/web/app/(driver)/vehicles
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useEffect, useState } from 'react'
import { Zap, Plus, Trash2, Car, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ────────────────────────────────────────────────── */

type ConnectorType =
  | 'type_2'
  | 'ccs_2'
  | 'chademo'
  | 'nacs'
  | 'nema_14_50'
  | 'tethered_type_2'

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  connectorType: ConnectorType
  batteryCapacityKwh: number | null
  maxRangeKm: number | null
  licensePlate: string | null
  colour: string | null
  isDefault: boolean
}

type AddVehicleInput = {
  make: string
  model: string
  year: number
  connectorType: ConnectorType
  batteryCapacityKwh: string
  maxRangeKm: string
  licensePlate: string
  colour: string
}

const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  type_2: 'Type 2 (AC)',
  ccs_2: 'CCS 2 (DC Fast)',
  chademo: 'CHAdeMO',
  nacs: 'NACS (Tesla)',
  nema_14_50: 'NEMA 14-50',
  tethered_type_2: 'Tethered Type 2',
}

const CURRENT_YEAR = new Date().getFullYear()

const EMPTY_FORM: AddVehicleInput = {
  make: '',
  model: '',
  year: CURRENT_YEAR,
  connectorType: 'type_2',
  batteryCapacityKwh: '',
  maxRangeKm: '',
  licensePlate: '',
  colour: '',
}

/* ── Vehicle card ─────────────────────────────────────────── */

function VehicleCard({
  vehicle,
  onDelete,
  onSetDefault,
}: {
  vehicle: Vehicle
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        vehicle.isDefault
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
          : 'border-[hsl(var(--border))]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
            <Car className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            {vehicle.licensePlate && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono uppercase">
                {vehicle.licensePlate}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vehicle.isDefault ? (
            <CheckCircle className="h-5 w-5 text-[hsl(var(--primary))]" aria-label="Default vehicle" />
          ) : (
            <button
              onClick={() => onSetDefault(vehicle.id)}
              className="rounded px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
              aria-label="Set as default"
            >
              Set default
            </button>
          )}
          <button
            onClick={() => onDelete(vehicle.id)}
            className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)_/_10%)] hover:text-[hsl(var(--destructive))]"
            aria-label={`Remove ${vehicle.make} ${vehicle.model}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {CONNECTOR_LABELS[vehicle.connectorType]}
        </span>
        {vehicle.batteryCapacityKwh != null && (
          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
            {vehicle.batteryCapacityKwh} kWh
          </span>
        )}
        {vehicle.maxRangeKm != null && (
          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
            {vehicle.maxRangeKm} km range
          </span>
        )}
        {vehicle.colour && (
          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs capitalize">
            {vehicle.colour}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AddVehicleInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchVehicles()
  }, [])

  async function fetchVehicles() {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/vehicles')
      if (res.ok) {
        const data = (await res.json()) as { data: Vehicle[] }
        setVehicles(data.data)
      }
    } catch {
      setError('Failed to load vehicles.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          connectorType: form.connectorType,
          batteryCapacityKwh: form.batteryCapacityKwh ? Number(form.batteryCapacityKwh) : null,
          maxRangeKm: form.maxRangeKm ? Number(form.maxRangeKm) : null,
          licensePlate: form.licensePlate.trim() || null,
          colour: form.colour.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        setError(err.error?.message ?? 'Failed to add vehicle.')
      } else {
        setForm(EMPTY_FORM)
        setShowForm(false)
        await fetchVehicles()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(vehicleId: string) {
    if (!confirm('Remove this vehicle from your account?')) return
    await fetch(`/api/v1/vehicles/${vehicleId}`, { method: 'DELETE' })
    await fetchVehicles()
  }

  async function handleSetDefault(vehicleId: string) {
    await fetch(`/api/v1/vehicles/${vehicleId}/default`, { method: 'POST' })
    await fetchVehicles()
  }

  const updateForm = (field: keyof AddVehicleInput, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }))

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My vehicles</h1>
        <button
          onClick={() => { setShowForm(!showForm); setError(null) }}
          className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white"
          aria-expanded={showForm}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add vehicle
        </button>
      </div>

      {/* Add vehicle form */}
      {showForm && (
        <form
          onSubmit={(e) => { void handleAdd(e) }}
          className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4 space-y-4"
          aria-label="Add a vehicle"
        >
          <h2 className="font-semibold">New vehicle</h2>

          {error && (
            <div role="alert" className="rounded-lg bg-[hsl(var(--destructive)_/_10%)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="make" className="mb-1 block text-xs font-medium">Make *</label>
              <input
                id="make"
                required
                value={form.make}
                onChange={(e) => updateForm('make', e.target.value)}
                placeholder="Tesla"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label htmlFor="model" className="mb-1 block text-xs font-medium">Model *</label>
              <input
                id="model"
                required
                value={form.model}
                onChange={(e) => updateForm('model', e.target.value)}
                placeholder="Model 3"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="year" className="mb-1 block text-xs font-medium">Year *</label>
              <input
                id="year"
                type="number"
                required
                min={2000}
                max={CURRENT_YEAR + 1}
                value={form.year}
                onChange={(e) => updateForm('year', e.target.value)}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label htmlFor="connectorType" className="mb-1 block text-xs font-medium">Connector *</label>
              <select
                id="connectorType"
                value={form.connectorType}
                onChange={(e) => updateForm('connectorType', e.target.value)}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              >
                {Object.entries(CONNECTOR_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="battery" className="mb-1 block text-xs font-medium">Battery (kWh)</label>
              <input
                id="battery"
                type="number"
                step="0.1"
                min="1"
                max="200"
                value={form.batteryCapacityKwh}
                onChange={(e) => updateForm('batteryCapacityKwh', e.target.value)}
                placeholder="82"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label htmlFor="range" className="mb-1 block text-xs font-medium">Range (km)</label>
              <input
                id="range"
                type="number"
                min="1"
                max="2000"
                value={form.maxRangeKm}
                onChange={(e) => updateForm('maxRangeKm', e.target.value)}
                placeholder="560"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="plate" className="mb-1 block text-xs font-medium">Number plate</label>
              <input
                id="plate"
                type="text"
                value={form.licensePlate}
                onChange={(e) => updateForm('licensePlate', e.target.value.toUpperCase())}
                placeholder="AB12 CDE"
                maxLength={8}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label htmlFor="colour" className="mb-1 block text-xs font-medium">Colour</label>
              <input
                id="colour"
                type="text"
                value={form.colour}
                onChange={(e) => updateForm('colour', e.target.value)}
                placeholder="Midnight Silver"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md bg-[hsl(var(--primary))] py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add vehicle'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null) }}
              className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Vehicle list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" aria-label="Loading" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[hsl(var(--border))] py-12 text-center">
          <Car className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No vehicles added yet</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Add your EV to start booking chargers.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white"
          >
            Add your first vehicle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              onDelete={(id) => { void handleDelete(id) }}
              onSetDefault={(id) => { void handleSetDefault(id) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
