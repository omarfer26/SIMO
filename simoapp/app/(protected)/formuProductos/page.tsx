"use client";

// SCRUM-31 (Camilo) — Arreglo de integración: este formulario (hecho por un
// compañero) armaba el producto pero solo lo mandaba a la consola del
// navegador (console.log), así que nunca aparecía en el catálogo — no
// había ningún lado real donde "agregarlo". Se conectó acá con
// `agregarProducto` del ProductosContext compartido (el mismo que lee
// /catalogo), y los campos se alinearon con el tipo `Producto` de SCRUM-31
// (antes usaba nombres distintos: `sku` en vez de `codigo`, `unidad` en vez
// de `unidadMedida`, y categoría como texto libre en vez del select con las
// 5 categorías válidas).
import { useState } from "react";
import Link from "next/link";
import { useProductos } from "@/components/catalogo/ProductosContext";
import { CATEGORIAS, type Categoria } from "@/components/catalogo/tipos";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";

export default function FormularioProductosPage() {
    const { agregarProducto } = useProductos();
    const [showNotification, setShowNotification] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);

        // (Camilo) — Se guarda el formulario en una variable antes del
        // `await`: después de esperar al backend, React deja
        // e.currentTarget en null y el reset() de abajo fallaba.
        const form = e.currentTarget;
        const formData = new FormData(form);

        await agregarProducto({
            codigo: String(formData.get("codigo")),
            nombre: String(formData.get("nombre")),
            descripcion: String(formData.get("descripcion")),
            categoria: formData.get("categoria") as Categoria,
            unidadMedida: String(formData.get("unidadMedida")),
            precioCompra: Number(formData.get("precioCompra")),
            precioVenta: Number(formData.get("precioVenta")),
            stockMinimo: Number(formData.get("stockMinimo")),
        });

        form.reset();
        setIsSubmitting(false);
        setShowNotification(true);
    };

    return (
        <main className="mx-auto w-full max-w-4xl p-4 md:p-8">
            <div className="bg-black/50 rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">

                <Modal
                    isOpen={showNotification}
                    onClose={() => setShowNotification(false)}
                    title="¡Éxito!"
                    footer={
                        <Link
                            href="/catalogo"
                            className="px-4 py-2 bg-[#3E5E51] text-white font-medium rounded-md hover:bg-[#5C8371]/80 transition-colors"
                        >
                            Ir al Catálogo
                        </Link>
                    }
                >
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300">
                            El producto ha sido añadido correctamente al catálogo.
                        </p>
                    </div>
                </Modal>

                <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <h1 className="text-2xl font-bold text-white">Crear Nuevo Producto</h1>
                        <button
                            type="reset"
                            form="producto-form"
                            className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                        >
                            Limpiar datos
                        </button>
                    </div>
                    <hr className="mt-4 border-gray-300" />
                </div>

                <form id="producto-form" className="space-y-6" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="col-span-1">
                            <label htmlFor="codigo" className="block text-sm font-semibold mb-2">
                                Código (SKU)
                            </label>
                            <input
                                type="text"
                                id="codigo"
                                name="codigo"
                                required
                                placeholder="Ej: PROD-1002"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <label htmlFor="nombre" className="block text-sm font-semibold mb-2">
                                Nombre del Producto
                            </label>
                            <input
                                type="text"
                                id="nombre"
                                name="nombre"
                                required
                                placeholder="Ingrese el nombre"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="descripcion" className="block text-sm font-semibold mb-2">
                            Descripción
                        </label>
                        <textarea
                            id="descripcion"
                            name="descripcion"
                            rows={4}
                            placeholder="Breve detalle de las especificaciones del producto..."
                            className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 resize-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="categoria" className="block text-sm font-semibold mb-2">
                                Categoría
                            </label>
                            <select
                                id="categoria"
                                name="categoria"
                                required
                                defaultValue=""
                                className="w-full border border-gray-400 text-gray-800 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="" disabled>
                                    Seleccione una categoría
                                </option>
                                {CATEGORIAS.map((categoria) => (
                                    <option key={categoria} value={categoria}>
                                        {categoria}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="unidadMedida" className="block text-sm font-semibold mb-2">
                                Unidad de Medida
                            </label>
                            <input
                                type="text"
                                id="unidadMedida"
                                name="unidadMedida"
                                required
                                placeholder="Ej: Unidad, Litros, Kg"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="precioCompra" className="block text-sm font-semibold mb-2">
                                Precio de Compra
                            </label>
                            <input
                                type="number"
                                id="precioCompra"
                                name="precioCompra"
                                required
                                min="0"
                                placeholder="0.00"
                                step="0.01"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label htmlFor="precioVenta" className="block text-sm font-semibold mb-2">
                                Precio de Venta
                            </label>
                            <input
                                type="number"
                                id="precioVenta"
                                name="precioVenta"
                                required
                                min="0"
                                placeholder="0.00"
                                step="0.01"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label htmlFor="stockMinimo" className="block text-sm font-semibold mb-2">
                                Stock Mínimo
                            </label>
                            <input
                                type="number"
                                id="stockMinimo"
                                name="stockMinimo"
                                required
                                min="0"
                                placeholder="Cantidad mínima"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <hr className="mt-8 border-gray-300" />

                    <div className="flex justify-end gap-4 mt-6">
                        <Link
                            href="/catalogo"
                            className="px-6 py-2 border border-gray-800 text-white font-semibold rounded-md hover:bg-gray-50 hover:text-black focus:outline-none focus:ring-2 focus:ring-gray-800 focus:ring-offset-2 transition-colors"
                        >
                            Cancelar
                        </Link>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2 bg-[#3E5E51] text-white font-semibold rounded-md hover:bg-[#5C8371]/80 focus:outline-none focus:ring-2 focus:ring-[#3E5E51] focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Spinner size="sm" color="white" />
                                    <span>Creando...</span>
                                </>
                            ) : (
                                "Crear producto"
                            )}
                        </button>
                    </div>
                </form>

            </div>
        </main>
    );
}
