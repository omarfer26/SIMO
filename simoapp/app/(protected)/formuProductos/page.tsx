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
//
// SCRUM-155 (Camilo) — Validación con React Hook Form + Zod. Antes solo
// estaba la validación del navegador (required, min="0"), que no revisaba
// espacios en el SKU ni que la venta superara la compra, y sus mensajes
// salían en el idioma del navegador. Ahora:
//  - Las reglas viven en lib/catalogo/esquemaProducto.ts.
//  - Cada campo se revisa al salir de él y, desde ahí, mientras se escribe
//    (mode "onTouched"). El error sale en rojo debajo del campo.
//  - Si algo no cumple, NO se llama a la API.
//  - Si la API rechaza el producto (p. ej. SKU repetido), el error sale en
//    el campo o arriba del formulario, y ya no aparece "¡Éxito!" por error.

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useProductos } from "@/components/catalogo/ProductosContext";
import { CATEGORIAS } from "@/components/catalogo/tipos";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
    esquemaProducto,
    type ProductoFormulario,
    type ProductoValidado,
} from "@/lib/catalogo/esquemaProducto";

// Valores con los que arranca (y vuelve con "Limpiar datos" o después de
// crear un producto). Los números van como "" para que el campo se vea
// vacío y no con un 0. Ojo: si se dejan sin poner, reset() NO borra lo que
// el usuario escribió en ellos (pasó en las pruebas). Si se envía vacío,
// Zod recibe "" y responde "Escribe el precio...".
const VACIO_NUMERICO = "" as unknown as number;
const VALORES_INICIALES: ProductoFormulario = {
    codigo: "",
    nombre: "",
    descripcion: "",
    categoria: "" as ProductoFormulario["categoria"],
    unidadMedida: "",
    precioCompra: VACIO_NUMERICO,
    precioVenta: VACIO_NUMERICO,
    stockMinimo: VACIO_NUMERICO,
};

// SCRUM-155 (Camilo) — Clases del input según tenga error o no: borde rojo
// si falló la validación, el borde gris de siempre si no.
function claseCampo(hayError: boolean, extra = "") {
    const borde = hayError
        ? "border-red-500 focus:ring-red-500"
        : "border-gray-400 focus:ring-blue-500";
    return `w-full border ${borde} rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-400 ${extra}`;
}

// SCRUM-155 (Camilo) — Mensaje de error debajo de un campo. Va en una
// etiqueta con fondo rojo claro porque el texto rojo solo no se leía bien
// sobre el fondo gris del formulario. El id permite que el lector de
// pantalla lo lea junto con el campo (aria-describedby).
function MensajeError({ id, mensaje }: { id: string; mensaje?: string }) {
    if (!mensaje) return null;
    return (
        <p
            id={id}
            role="alert"
            className="mt-1.5 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700"
        >
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <span>{mensaje}</span>
        </p>
    );
}

export default function FormularioProductosPage() {
    const { agregarProducto } = useProductos();
    const [showNotification, setShowNotification] = useState(false);
    // Error que no es de un campo puntual (servidor caído, falta de permiso...).
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ProductoFormulario, unknown, ProductoValidado>({
        resolver: zodResolver(esquemaProducto),
        mode: "onTouched",
        defaultValues: VALORES_INICIALES,
    });

    // Solo se ejecuta si Zod aprobó todo; `datos` ya viene limpio (sin
    // espacios de sobra y con los precios como número).
    const onSubmit = async (datos: ProductoValidado) => {
        setErrorGeneral(null);
        const resultado = await agregarProducto(datos);

        if (!resultado.ok) {
            if (resultado.campo) {
                setError(resultado.campo, { message: resultado.mensaje }, { shouldFocus: true });
            } else {
                setErrorGeneral(resultado.mensaje);
            }
            return;
        }

        reset(VALORES_INICIALES);
        setShowNotification(true);
    };

    const limpiar = () => {
        reset(VALORES_INICIALES);
        setErrorGeneral(null);
    };

    // Atributos de accesibilidad comunes a cada campo con posible error.
    const accesible = (campo: keyof ProductoFormulario) => ({
        "aria-invalid": errors[campo] ? true : undefined,
        "aria-describedby": errors[campo] ? `error-${campo}` : undefined,
    });

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
                            type="button"
                            onClick={limpiar}
                            className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                        >
                            Limpiar datos
                        </button>
                    </div>
                    <hr className="mt-4 border-gray-300" />
                </div>

                {/* noValidate apaga los globos del navegador: los mensajes
                    los pone Zod, en español y debajo de cada campo. */}
                <form id="producto-form" className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
                    {errorGeneral && (
                        <div
                            role="alert"
                            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                        >
                            No se pudo crear el producto: {errorGeneral}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="col-span-1">
                            <label htmlFor="codigo" className="block text-sm font-semibold mb-2">
                                Código (SKU)
                            </label>
                            <input
                                type="text"
                                id="codigo"
                                placeholder="Ej: PROD-1002"
                                autoComplete="off"
                                className={claseCampo(!!errors.codigo)}
                                {...accesible("codigo")}
                                {...register("codigo")}
                            />
                            <MensajeError id="error-codigo" mensaje={errors.codigo?.message} />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <label htmlFor="nombre" className="block text-sm font-semibold mb-2">
                                Nombre del Producto
                            </label>
                            <input
                                type="text"
                                id="nombre"
                                placeholder="Ingrese el nombre"
                                className={claseCampo(!!errors.nombre)}
                                {...accesible("nombre")}
                                {...register("nombre")}
                            />
                            <MensajeError id="error-nombre" mensaje={errors.nombre?.message} />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="descripcion" className="block text-sm font-semibold mb-2">
                            Descripción <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <textarea
                            id="descripcion"
                            rows={4}
                            placeholder="Breve detalle de las especificaciones del producto..."
                            className={claseCampo(!!errors.descripcion, "resize-none")}
                            {...register("descripcion")}
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="categoria" className="block text-sm font-semibold mb-2">
                                Categoría
                            </label>
                            <select
                                id="categoria"
                                className={claseCampo(!!errors.categoria, "text-gray-800")}
                                {...accesible("categoria")}
                                {...register("categoria")}
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
                            <MensajeError id="error-categoria" mensaje={errors.categoria?.message} />
                        </div>

                        <div>
                            <label htmlFor="unidadMedida" className="block text-sm font-semibold mb-2">
                                Unidad de Medida
                            </label>
                            <input
                                type="text"
                                id="unidadMedida"
                                placeholder="Ej: Unidad, Litros, Kg"
                                className={claseCampo(!!errors.unidadMedida)}
                                {...accesible("unidadMedida")}
                                {...register("unidadMedida")}
                            />
                            <MensajeError id="error-unidadMedida" mensaje={errors.unidadMedida?.message} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="precioCompra" className="block text-sm font-semibold mb-2">
                                Precio de Compra
                            </label>
                            {/* valueAsNumber: React Hook Form entrega un número
                                (o NaN si está vacío) en vez de texto. deps:
                                al cambiar la compra se vuelve a revisar la
                                venta, por la regla "venta > compra". */}
                            <input
                                type="number"
                                id="precioCompra"
                                min="0"
                                placeholder="0.00"
                                step="0.01"
                                inputMode="decimal"
                                className={claseCampo(!!errors.precioCompra)}
                                {...accesible("precioCompra")}
                                {...register("precioCompra", { valueAsNumber: true, deps: ["precioVenta"] })}
                            />
                            <MensajeError id="error-precioCompra" mensaje={errors.precioCompra?.message} />
                        </div>

                        <div>
                            <label htmlFor="precioVenta" className="block text-sm font-semibold mb-2">
                                Precio de Venta
                            </label>
                            <input
                                type="number"
                                id="precioVenta"
                                min="0"
                                placeholder="0.00"
                                step="0.01"
                                inputMode="decimal"
                                className={claseCampo(!!errors.precioVenta)}
                                {...accesible("precioVenta")}
                                {...register("precioVenta", { valueAsNumber: true })}
                            />
                            <MensajeError id="error-precioVenta" mensaje={errors.precioVenta?.message} />
                        </div>

                        <div>
                            <label htmlFor="stockMinimo" className="block text-sm font-semibold mb-2">
                                Stock Mínimo
                            </label>
                            <input
                                type="number"
                                id="stockMinimo"
                                min="0"
                                placeholder="Cantidad mínima"
                                inputMode="decimal"
                                className={claseCampo(!!errors.stockMinimo)}
                                {...accesible("stockMinimo")}
                                {...register("stockMinimo", { valueAsNumber: true })}
                            />
                            <MensajeError id="error-stockMinimo" mensaje={errors.stockMinimo?.message} />
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
