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

export default function FormularioProductosPage() {
    const { agregarProducto } = useProductos();
    const [showNotification, setShowNotification] = useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        agregarProducto({
            codigo: String(formData.get("codigo")),
            nombre: String(formData.get("nombre")),
            descripcion: String(formData.get("descripcion")),
            categoria: formData.get("categoria") as Categoria,
            unidadMedida: String(formData.get("unidadMedida")),
            precioCompra: Number(formData.get("precioCompra")),
            precioVenta: Number(formData.get("precioVenta")),
            stockMinimo: Number(formData.get("stockMinimo")),
        });

        e.currentTarget.reset();
        setShowNotification(true);
        // Ocultar la notificación después de 3 segundos
        setTimeout(() => setShowNotification(false), 3000);
    };

    return (
        <main className="mx-auto w-full max-w-4xl p-4 md:p-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">

                {showNotification && (
                    <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-md font-medium text-center">
                        Producto añadido correctamente al catálogo.{" "}
                        <Link href="/catalogo" className="underline hover:no-underline">
                            Verlo en /catalogo
                        </Link>
                    </div>
                )}

                <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <h1 className="text-2xl font-bold text-gray-900">Crear Nuevo Producto</h1>
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
                            <label htmlFor="codigo" className="block text-sm font-semibold text-gray-800 mb-2">
                                Código (SKU)
                            </label>
                            <input
                                type="text"
                                id="codigo"
                                name="codigo"
                                required
                                placeholder="Ej: PROD-1002"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <label htmlFor="nombre" className="block text-sm font-semibold text-gray-800 mb-2">
                                Nombre del Producto
                            </label>
                            <input
                                type="text"
                                id="nombre"
                                name="nombre"
                                required
                                placeholder="Ingrese el nombre"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="descripcion" className="block text-sm font-semibold text-gray-800 mb-2">
                            Descripción
                        </label>
                        <textarea
                            id="descripcion"
                            name="descripcion"
                            rows={4}
                            placeholder="Breve detalle de las especificaciones del producto..."
                            className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 resize-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="categoria" className="block text-sm font-semibold text-gray-800 mb-2">
                                Categoría
                            </label>
                            <select
                                id="categoria"
                                name="categoria"
                                required
                                defaultValue=""
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                            <label htmlFor="unidadMedida" className="block text-sm font-semibold text-gray-800 mb-2">
                                Unidad de Medida
                            </label>
                            <input
                                type="text"
                                id="unidadMedida"
                                name="unidadMedida"
                                required
                                placeholder="Ej: Unidad, Litros, Kg"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="precioCompra" className="block text-sm font-semibold text-gray-800 mb-2">
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
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label htmlFor="precioVenta" className="block text-sm font-semibold text-gray-800 mb-2">
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
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label htmlFor="stockMinimo" className="block text-sm font-semibold text-gray-800 mb-2">
                                Stock Mínimo
                            </label>
                            <input
                                type="number"
                                id="stockMinimo"
                                name="stockMinimo"
                                required
                                min="0"
                                placeholder="Cantidad mínima"
                                className="w-full border border-gray-400 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <hr className="mt-8 border-gray-300" />

                    <div className="flex justify-end gap-4 mt-6">
                        <button
                            type="button"
                            className="px-6 py-2 border border-gray-800 text-gray-900 font-semibold rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:ring-offset-2 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-[#3E5E51] text-white font-semibold rounded-md hover:bg-[#5C8371]/80 focus:outline-none focus:ring-2 focus:ring-[#3E5E51] focus:ring-offset-2 transition-colors"
                        >
                            Crear producto
                        </button>
                    </div>
                </form>

            </div>
        </main>
    );
}
