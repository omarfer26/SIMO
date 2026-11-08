"use client";

// SCRUM-123 (Camilo) — Buscador predictivo de clientes del POS (contenido del
// modal "Cliente de la venta").
//  - Sin escribir: muestra los clientes recientes de este equipo.
//  - Desde 2 caracteres: busca mientras se escribe (espera 300 ms a que el
//    cajero pare de teclear, para no pedirle al backend una búsqueda por
//    cada letra). La cédula/NIT se busca por cómo empieza y el nombre por
//    cualquier parte, igual que el backend.
//  - Con el teclado: ↑ ↓ para moverse y Enter para elegir.
//  - Sin resultados: botón para registrarlo con lo que se escribió.

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import InputText from "@/components/ui/InputText";
import { Spinner } from "@/components/ui/Spinner";
import { buscarClientes, mensajeErrorCliente } from "@/lib/clientes/clientesService";
import { leerClientesRecientes } from "@/lib/clientes/clientesRecientes";
import { formatoDocumento } from "@/lib/clientes/validaciones";
import type { Cliente } from "@/lib/clientes/tipos";

const MINIMO_CARACTERES = 2;
const ESPERA_TECLEO_MS = 300;

interface BuscarClienteProps {
  onSeleccionar: (cliente: Cliente) => void;
  /** Abre "Registrar cliente nuevo" con lo que se escribió en el buscador. */
  onRegistrarNuevo: (texto: string) => void;
}

interface Respuesta {
  termino: string;
  clientes: Cliente[];
  error: string;
}

export default function BuscarCliente({ onSeleccionar, onRegistrarNuevo }: BuscarClienteProps) {
  const idLista = useId();
  const [texto, setTexto] = useState("");
  const [recientes] = useState(leerClientesRecientes);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [intento, setIntento] = useState(0);
  const [activo, setActivo] = useState(0);

  const termino = texto.trim().replace(/\s+/g, " ");
  const buscando = termino.length >= MINIMO_CARACTERES;

  useEffect(() => {
    if (!buscando) return;
    // `vigente` evita que una respuesta vieja (de lo que se escribió antes)
    // pise a la nueva si llega tarde.
    let vigente = true;
    const temporizador = setTimeout(async () => {
      try {
        const clientes = await buscarClientes(termino);
        if (vigente) setRespuesta({ termino, clientes, error: "" });
      } catch (error) {
        if (vigente) setRespuesta({ termino, clientes: [], error: mensajeErrorCliente(error) });
      }
    }, ESPERA_TECLEO_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [termino, buscando, intento]);

  // Mientras llega la respuesta nueva se siguen mostrando los resultados
  // anteriores (atenuados), para que la lista no parpadee en cada letra.
  const cargando = buscando && respuesta?.termino !== termino;
  const lista = buscando ? (respuesta?.clientes ?? []) : recientes;
  const error = buscando && !cargando ? respuesta?.error : "";
  const sinResultados = buscando && !cargando && !error && lista.length === 0;
  const indiceActivo = Math.min(activo, lista.length - 1);

  const elegir = (cliente: Cliente | undefined) => {
    if (cliente) onSeleccionar(cliente);
  };

  const handleKeyDown = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (lista.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setActivo((indiceActivo + 1) % lista.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setActivo((indiceActivo - 1 + lista.length) % lista.length);
    } else if (evento.key === "Enter" && !cargando) {
      evento.preventDefault();
      elegir(lista[indiceActivo]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <InputText
          name="buscarCliente"
          label="Cédula, NIT o nombre"
          placeholder="Ej: 1090123456 o María Rojas"
          autoComplete="off"
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={lista.length > 0}
          aria-controls={idLista}
          aria-activedescendant={lista.length > 0 ? `${idLista}-${indiceActivo}` : undefined}
          hint={`Escribe al menos ${MINIMO_CARACTERES} caracteres. Usa ↑ ↓ y Enter para elegir.`}
        />
        {cargando && (
          <span className="absolute right-3 top-[2.1rem]">
            <Spinner size="sm" color="gray" />
          </span>
        )}
      </div>

      {!buscando && recientes.length > 0 && (
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Clientes recientes en este equipo
        </p>
      )}

      {lista.length > 0 && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Clientes encontrados"
          className={`max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 transition-opacity dark:divide-zinc-800 dark:border-zinc-800 ${
            cargando ? "opacity-60" : ""
          }`}
        >
          {lista.map((cliente, i) => (
            <li
              key={cliente.id}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === indiceActivo}
              onClick={() => elegir(cliente)}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-2 ${
                i === indiceActivo ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
              }`}
            >
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{cliente.nombre}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {cliente.tipoDocumento} {formatoDocumento(cliente.documento)}
                {cliente.telefono && ` · ${cliente.telefono}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!buscando && recientes.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Escribe la cédula, el NIT o el nombre del cliente.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="shrink-0 font-medium underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {sinResultados && (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            No hay clientes activos con «{termino}».
          </p>
          <button
            type="button"
            onClick={() => onRegistrarNuevo(termino)}
            className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Registrar cliente nuevo
          </button>
        </div>
      )}

      {!sinResultados && (
        <p className="text-right text-sm">
          <button
            type="button"
            onClick={() => onRegistrarNuevo(termino)}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ¿No está? Registrar cliente nuevo
          </button>
        </p>
      )}
    </div>
  );
}
