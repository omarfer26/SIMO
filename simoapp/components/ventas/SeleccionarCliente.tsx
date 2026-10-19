"use client";

// SCRUM-123 (Camilo) — Modal "Cliente de la venta" del POS. Tiene dos
// pantallas: el buscador (BuscarCliente) y, si el cliente no existe, el
// formulario para registrarlo (FormularioClienteNuevo). Elija o registre, el
// cliente queda guardado en "recientes" y se le pasa a la página con
// `onSeleccionar`.
//
// La página le cambia el `key` cada vez que lo abre, para que arranque
// siempre limpio en el buscador.

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import BuscarCliente from "./BuscarCliente";
import FormularioClienteNuevo from "./FormularioClienteNuevo";
import { recordarCliente } from "@/lib/clientes/clientesRecientes";
import type { Cliente } from "@/lib/clientes/tipos";

interface SeleccionarClienteProps {
  abierto: boolean;
  onCerrar: () => void;
  onSeleccionar: (cliente: Cliente) => void;
}

export default function SeleccionarCliente({
  abierto,
  onCerrar,
  onSeleccionar,
}: SeleccionarClienteProps) {
  // null = buscador; texto = formulario de registro con lo que se buscó.
  const [registrando, setRegistrando] = useState<string | null>(null);

  const elegir = (cliente: Cliente) => {
    recordarCliente(cliente);
    onSeleccionar(cliente);
  };

  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      title={registrando === null ? "Cliente de la venta" : "Registrar cliente nuevo"}
      maxWidth="lg"
      // Solo en el formulario: un clic afuera por error borraría lo escrito.
      closeOnBackdropClick={registrando === null}
    >
      {registrando === null ? (
        <BuscarCliente onSeleccionar={elegir} onRegistrarNuevo={setRegistrando} />
      ) : (
        <FormularioClienteNuevo
          textoBuscado={registrando}
          onRegistrado={elegir}
          onVolver={() => setRegistrando(null)}
        />
      )}
    </Modal>
  );
}
