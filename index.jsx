import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, FileText, CheckCircle, Sparkles, Wand2, X, Loader2, Settings } from 'lucide-react';

// Llave de API (El entorno proveerá la llave en tiempo de ejecución)
const apiKey = "";

const App = () => {
  // Estado para los datos del cliente y cabecera
  const [cliente, setCliente] = useState('');
  const [ruc, setRuc] = useState('');
  const [fecha, setFecha] = useState('');
  
  // Estado para metadatos de la cotización (Para el formato impreso)
  const [cotizacionNum, setCotizacionNum] = useState('001');
  const [asesor, setAsesor] = useState('Miguel Zegarra Ayala');
  const [tiempoEntrega, setTiempoEntrega] = useState('5 dias utiles');
  const [validezDias, setValidezDias] = useState(7);
  const [fechaValidez, setFechaValidez] = useState('');

  // Estado para los ítems de la cotización
  const [items, setItems] = useState([
    { id: 1, codigo: '001', descripcion: '', tipo: 'unidad', precio: 0, cantidad: 1, largo: '', ancho: '', total: 0, isEnhancing: false }
  ]);

  // Estado para la simulación de guardado
  const [guardado, setGuardado] = useState(false);

  // Estados para la función de Importación Mágica con Gemini
  const [showMagicModal, setShowMagicModal] = useState(false);
  const [magicText, setMagicText] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [magicError, setMagicError] = useState('');

  // Inicializar la fecha y calcular la fecha de validez
  useEffect(() => {
    const hoy = new Date();
    const fechaFormateada = hoy.toISOString().split('T')[0];
    if (!fecha) setFecha(fechaFormateada);
  }, []);

  useEffect(() => {
    if (fecha) {
      const date = new Date(fecha);
      date.setDate(date.getDate() + Number(validezDias));
      setFechaValidez(date.toISOString().split('T')[0]);
    }
  }, [fecha, validezDias]);

  // --- Funciones del LLM (Gemini API) ---
  const fetchGemini = async (payload) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    let retries = 5;
    let delay = 1000;

    while (retries > 0) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    }
  };

  const mejorarDescripcionConIA = async (id, textoActual) => {
    if (!textoActual.trim()) return;
    setItems(items.map(item => item.id === id ? { ...item, isEnhancing: true } : item));

    try {
      const payload = {
        contents: [{ parts: [{ text: `Eres un experto en ventas de materiales de construcción y plásticos. Mejora la siguiente descripción de un producto para una cotización formal de la empresa "Luthiplast". Hazlo profesional, persuasivo y conciso (máximo 2 oraciones). Solo devuelve el texto mejorado, sin comillas ni texto adicional. Texto original: "${textoActual}"` }] }]
      };
      const result = await fetchGemini(payload);
      const textoMejorado = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textoMejorado) actualizarItem(id, 'descripcion', textoMejorado.trim());
    } catch (error) {
      console.error("Error al mejorar descripción:", error);
    } finally {
      setItems(prevItems => prevItems.map(item => item.id === id ? { ...item, isEnhancing: false } : item));
    }
  };

  const generarDesdeTextoConIA = async () => {
    if (!magicText.trim()) return;
    setIsMagicLoading(true);
    setMagicError('');

    try {
      const payload = {
        contents: [{ parts: [{ text: `Extrae los productos solicitados en el siguiente mensaje del cliente para crear una cotización formal. Identifica cantidades, dimensiones y precios. Mensaje: "${magicText}"` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              productos: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    descripcion: { type: "STRING" },
                    tipo: { type: "STRING", enum: ["unidad", "m2"] },
                    cantidad: { type: "NUMBER" },
                    largo: { type: "NUMBER" },
                    ancho: { type: "NUMBER" },
                    precio: { type: "NUMBER" }
                  },
                  required: ["descripcion", "tipo", "cantidad", "precio"]
                }
              }
            }
          }
        }
      };

      const result = await fetchGemini(payload);
      const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonText) throw new Error("No se obtuvo respuesta.");
      const data = JSON.parse(jsonText);

      if (data.productos && data.productos.length > 0) {
        const nuevosItems = data.productos.map((prod, index) => {
          const isM2 = prod.tipo === 'm2' || (prod.largo > 0 && prod.ancho > 0);
          const tipo = isM2 ? 'm2' : 'unidad';
          const largo = isM2 ? (prod.largo || '') : '';
          const ancho = isM2 ? (prod.ancho || '') : '';
          let cantidad = prod.cantidad || 1;
          if (isM2 && typeof largo === 'number' && typeof ancho === 'number') cantidad = largo * ancho;

          return {
            id: Date.now() + index,
            codigo: `00${items.length + index + 1}`.slice(-3),
            descripcion: prod.descripcion || 'Producto extraído',
            tipo: tipo,
            precio: prod.precio || 0,
            cantidad: cantidad,
            largo: largo,
            ancho: ancho,
            total: (prod.precio || 0) * cantidad,
            isEnhancing: false
          };
        });

        if (items.length === 1 && !items[0].descripcion && items[0].precio === 0) {
          setItems(nuevosItems);
        } else {
          setItems([...items, ...nuevosItems]);
        }
        setShowMagicModal(false);
        setMagicText('');
      } else {
        setMagicError("No se pudieron extraer productos.");
      }
    } catch (error) {
      console.error("Error en magic import:", error);
      setMagicError("Hubo un error al procesar el texto con IA.");
    } finally {
      setIsMagicLoading(false);
    }
  };

  // --- Funciones Base ---
  const agregarItem = () => {
    const nuevoId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    const nuevoCodigo = `00${items.length + 1}`.slice(-3);
    setItems([
      ...items,
      { id: nuevoId, codigo: nuevoCodigo, descripcion: '', tipo: 'unidad', precio: 0, cantidad: 1, largo: '', ancho: '', total: 0, isEnhancing: false }
    ]);
  };

  const eliminarItem = (id) => setItems(items.filter(item => item.id !== id));

  const actualizarItem = (id, campo, valor) => {
    const itemsActualizados = items.map(item => {
      if (item.id === id) {
        const itemModificado = { ...item, [campo]: valor };
        let precio = parseFloat(itemModificado.precio) || 0;
        let cantidad = parseFloat(itemModificado.cantidad) || 0;

        if (itemModificado.tipo === 'm2') {
          if (campo === 'largo' || campo === 'ancho' || campo === 'tipo') {
            const largo = parseFloat(itemModificado.largo) || 0;
            const ancho = parseFloat(itemModificado.ancho) || 0;
            cantidad = largo * ancho;
            itemModificado.cantidad = cantidad;
          }
        } else if (campo === 'tipo') {
           if (cantidad === 0) itemModificado.cantidad = 1;
           cantidad = itemModificado.cantidad;
        }
        itemModificado.total = precio * cantidad;
        return itemModificado;
      }
      return item;
    });
    setItems(itemsActualizados);
  };

  const subtotal = items.reduce((acc, item) => acc + (item.total || 0), 0);
  const igv = subtotal * 0.18;
  const totalGeneral = subtotal + igv;

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(valor);
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '';
    const [year, month, day] = fechaStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const handleImprimir = () => window.print();
  const handleGuardar = () => {
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  // Logo Componente para reusar
  const Logo = ({ size = "w-24 h-24" }) => (
    <div className={`${size} rounded-full bg-[#2d4399] flex items-center justify-center border-4 border-white shadow-md print:shadow-none shrink-0 relative overflow-hidden`}>
      <svg viewBox="0 0 100 100" className="w-full h-full text-white p-2">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M25 80 L75 80" stroke="currentColor" strokeWidth="2" />
        <path d="M28 85 L72 85" stroke="currentColor" strokeWidth="2" />
        <rect x="30" y="30" width="15" height="48" fill="#c3d5f5" />
        <rect x="45" y="25" width="20" height="53" fill="#c3d5f5" />
        <path d="M45 50 L65 50 L65 78 L45 78 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="52" y="32" width="6" height="12" fill="#2d4399" />
        <circle cx="70" cy="40" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="23" cy="45" r="1.5" fill="currentColor" />
        <circle cx="23" cy="55" r="1.5" fill="currentColor" />
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:py-0 print:bg-white text-gray-800 font-sans">
      
      {/* --- VISTA INTERACTIVA (Oculta en la impresión) --- */}
      <div className="print:hidden max-w-6xl mx-auto">
        
        {/* Modales y Alertas (Iguales que antes) */}
        {showMagicModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all">
              <div className="bg-gradient-to-r from-purple-700 to-indigo-800 px-6 py-4 flex justify-between items-center text-white">
                <div className="flex items-center gap-2">
                  <Wand2 size={20} className="text-purple-200" />
                  <h3 className="font-semibold text-lg">Importación Mágica</h3>
                </div>
                <button onClick={() => setShowMagicModal(false)} className="text-white/70 hover:text-white" disabled={isMagicLoading}>
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">Pega el mensaje del cliente (ej. de WhatsApp o correo). La Inteligencia Artificial analizará el texto para extraer los productos.</p>
                <textarea
                  value={magicText}
                  onChange={(e) => setMagicText(e.target.value)}
                  placeholder="Ej: Hola, necesito cotizar 3 ventanas acrílicas de 1.5 x 2 metros a S/80..."
                  className="w-full h-32 px-3 py-2 text-gray-700 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-purple-50/30 resize-none mb-2"
                  disabled={isMagicLoading}
                />
                {magicError && <p className="text-red-500 text-sm font-medium mb-2">{magicError}</p>}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={generarDesdeTextoConIA}
                    disabled={!magicText.trim() || isMagicLoading}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-all ${
                      !magicText.trim() || isMagicLoading ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-md hover:shadow-lg'
                    }`}
                  >
                    {isMagicLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    <span>{isMagicLoading ? 'Analizando...' : 'Generar Ítems'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {guardado && (
          <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg flex items-center gap-2 animate-bounce z-50">
            <CheckCircle size={20} />
            <span>¡Cotización guardada exitosamente!</span>
          </div>
        )}

        {/* Toolbar Interactivo */}
        <div className="bg-slate-800 text-white px-8 py-4 flex justify-between items-center rounded-t-lg shadow-md">
          <div className="flex items-center gap-2">
            <FileText size={20} />
            <span className="font-semibold text-lg">Modo Edición: Sistema de Cotizaciones</span>
          </div>
          <div className="flex gap-4">
            <button onClick={handleGuardar} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition-colors">
              <Save size={18} /><span>Guardar en Sheets</span>
            </button>
            <button onClick={handleImprimir} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors shadow-lg shadow-blue-500/30">
              <Printer size={18} /><span>Generar PDF / Imprimir</span>
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-b-lg shadow-xl border-x border-b border-gray-200">
          
          {/* Paneles de Configuración */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            
            {/* Panel Cliente */}
            <div className="bg-blue-50/50 p-6 rounded-lg border border-blue-100">
              <h3 className="text-lg font-semibold text-[#2d4399] mb-4 flex items-center gap-2">
                Datos del Cliente
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Razón Social</label>
                  <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#2d4399] outline-none" placeholder="CLUB UNIVERSITARIO..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DNI / RUC</label>
                    <input type="text" value={ruc} onChange={(e) => setRuc(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#2d4399] outline-none" placeholder="Opcional" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Emisión</label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#2d4399] outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Panel Configuración del Documento */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Settings size={18}/> Configuración del Documento Final
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">N° Cotización</label>
                  <input type="text" value={cotizacionNum} onChange={(e) => setCotizacionNum(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Validez (Días)</label>
                  <input type="number" value={validezDias} onChange={(e) => setValidezDias(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Asesor de Ventas</label>
                  <input type="text" value={asesor} onChange={(e) => setAsesor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Tiempo de Entrega (Términos)</label>
                  <input type="text" value={tiempoEntrega} onChange={(e) => setTiempoEntrega(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded outline-none" placeholder="Ej: 5 dias utiles" />
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Interactiva de Ítems */}
          <div className="mb-8 overflow-x-auto border border-gray-300 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#4a5568] text-white">
                  <th className="py-3 px-4 font-medium w-[10%]">Código</th>
                  <th className="py-3 px-4 font-medium w-[30%]">Descripción del Producto</th>
                  <th className="py-3 px-4 font-medium w-[15%]">Medida</th>
                  <th className="py-3 px-4 font-medium w-[15%] text-center">Cant/Dim</th>
                  <th className="py-3 px-4 font-medium w-[15%]">Precio Unit.</th>
                  <th className="py-3 px-4 font-medium w-[15%] text-right">Total</th>
                  <th className="py-3 px-4 font-medium w-[5%] text-center"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${item.isEnhancing ? 'animate-pulse bg-purple-50' : ''} border-b border-gray-200`}>
                    <td className="py-2 px-4 align-top">
                      <input type="text" value={item.codigo} onChange={(e) => actualizarItem(item.id, 'codigo', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm outline-none" disabled={item.isEnhancing}/>
                    </td>
                    <td className="py-2 px-4 align-top">
                      <div className="flex flex-col gap-1">
                        <textarea value={item.descripcion} onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-[#2d4399] outline-none min-h-[50px] resize-y text-sm" placeholder="Descripción..." disabled={item.isEnhancing} />
                        <button onClick={() => mejorarDescripcionConIA(item.id, item.descripcion)} disabled={item.isEnhancing || !item.descripcion.trim()} className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium w-fit transition-colors group disabled:opacity-50">
                          {item.isEnhancing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {item.isEnhancing ? 'Mejorando...' : '✨ Mejorar'}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-4 align-top">
                      <select value={item.tipo} onChange={(e) => actualizarItem(item.id, 'tipo', e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded text-sm outline-none bg-white" disabled={item.isEnhancing}>
                        <option value="unidad">Unidades</option>
                        <option value="m2">Metros (m²)</option>
                      </select>
                    </td>
                    <td className="py-2 px-4 align-top">
                      {item.tipo === 'm2' ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min="0" step="0.01" value={item.largo || ''} onChange={(e) => actualizarItem(item.id, 'largo', e.target.value)} className="w-full min-w-[45px] px-1 py-1 border border-gray-300 rounded text-center text-sm outline-none" placeholder="L" disabled={item.isEnhancing}/>
                            <span className="text-gray-400 text-sm font-bold">x</span>
                            <input type="number" min="0" step="0.01" value={item.ancho || ''} onChange={(e) => actualizarItem(item.id, 'ancho', e.target.value)} className="w-full min-w-[45px] px-1 py-1 border border-gray-300 rounded text-center text-sm outline-none" placeholder="A" disabled={item.isEnhancing}/>
                          </div>
                          <div className="text-xs text-center bg-gray-200 rounded py-1 border border-gray-300 font-medium">
                            {item.cantidad ? Number(item.cantidad).toFixed(2) : '0.00'} m²
                          </div>
                        </div>
                      ) : (
                        <input type="number" min="0" step="1" value={item.cantidad || ''} onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded text-center text-sm outline-none" placeholder="1" disabled={item.isEnhancing}/>
                      )}
                    </td>
                    <td className="py-2 px-4 align-top">
                      <input type="number" min="0" step="0.01" value={item.precio || ''} onChange={(e) => actualizarItem(item.id, 'precio', e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded text-right text-sm outline-none" placeholder="0.00" disabled={item.isEnhancing}/>
                    </td>
                    <td className="py-2 px-4 text-right font-medium text-gray-700 align-top pt-4">
                      {formatearMoneda(item.total)}
                    </td>
                    <td className="py-2 px-4 text-center align-top pt-3">
                      <button onClick={() => eliminarItem(item.id)} className="text-red-500 hover:bg-red-50 p-2 rounded" disabled={item.isEnhancing}>
                        <Trash2 size={16} className="mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="p-4 bg-gray-50 flex gap-4 border-t border-gray-300">
              <button onClick={agregarItem} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium px-4 py-2 rounded bg-white border border-gray-300 shadow-sm transition-colors text-sm">
                <Plus size={16} /> Añadir fila manual
              </button>
              <button onClick={() => setShowMagicModal(true)} className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium px-4 py-2 rounded border border-purple-300 transition-colors shadow-sm text-sm">
                <Wand2 size={16} /> ✨ Generar desde texto
              </button>
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
              <div className="w-full md:w-1/3 bg-gray-100 rounded-lg p-6 border border-gray-300 shadow-inner">
                <div className="flex justify-between mb-3 text-gray-600 text-lg">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatearMoneda(subtotal)}</span>
                </div>
                <div className="flex justify-between mb-3 text-gray-600 text-lg">
                  <span>IGV (18%):</span>
                  <span className="font-medium">{formatearMoneda(igv)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t-2 border-gray-300 text-2xl font-bold text-[#2d4399]">
                  <span>TOTAL:</span>
                  <span>{formatearMoneda(totalGeneral)}</span>
                </div>
              </div>
          </div>

        </div>
      </div>


      {/* ========================================================================= */}
      {/* --- VISTA DE IMPRESIÓN (Idéntica al PDF de referencia, oculta en UI) --- */}
      {/* ========================================================================= */}
      
      <div className="hidden print:block w-full max-w-[210mm] mx-auto bg-white p-[10mm] font-sans text-black text-[12px] leading-relaxed">
        
        {/* Cabecera Principal */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex gap-6 items-center">
            <Logo size="w-28 h-28" />
            <div>
              <h1 className="font-bold text-[22px] text-[#2d4399] tracking-wide mb-2">IMPORTACIONES<br/>LUTHIPLAST EIRL</h1>
              <p>Magdalena Del Mar</p>
              <p>Ciudad: Lima</p>
              <p>Sitio Web: www.luthiplast.com</p>
              <p>Teléfono: 992 753 053</p>
              <p>E-mail: miguel@luthiplast.com</p>
              <p className="mt-1">Asesor de venta: <span className="font-semibold">{asesor}</span></p>
            </div>
          </div>
          
          {/* Cuadro de Info (Derecha) */}
          <div className="border border-black mt-4">
            <table className="text-[12px] border-collapse w-48">
              <tbody>
                <tr className="border-b border-black">
                  <td className="bg-[#f0f0f0] p-1.5 font-bold border-r border-black w-2/5">FECHA</td>
                  <td className="p-1.5 text-center">{formatearFecha(fecha)}</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="bg-[#f0f0f0] p-1.5 font-bold border-r border-black">COTIZACIÓN</td>
                  <td className="p-1.5 text-center">{cotizacionNum}</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="bg-[#f0f0f0] p-1.5 font-bold border-r border-black">CLIENTE ID</td>
                  <td className="p-1.5 text-center">{ruc || '---'}</td>
                </tr>
                <tr>
                  <td className="bg-[#f0f0f0] p-1.5 font-bold border-r border-black text-[10px] leading-tight">VALIDO HASTA</td>
                  <td className="p-1.5 text-center">{formatearFecha(fechaValidez)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Título y Cliente */}
        <div className="text-center mb-6">
          <h2 className="text-[26px] font-bold tracking-widest mb-4">COTIZACIÓN</h2>
          <div className="text-left font-bold text-[14px]">
            CLIENTE: {cliente.toUpperCase() || '_____________________________________'}
          </div>
        </div>

        {/* Tabla de Productos de Impresión */}
        <div className="mb-4 min-h-[300px]">
          <table className="w-full text-left border-collapse border border-black">
            <thead>
              <tr className="bg-[#2d4399] text-white">
                <th className="py-2 px-3 border border-black font-bold w-[12%] text-center">CÓDIGO</th>
                <th className="py-2 px-3 border border-black font-bold w-[43%] text-center">DESCRIPCIÓN</th>
                <th className="py-2 px-3 border border-black font-bold w-[10%] text-center">CANT</th>
                <th className="py-2 px-3 border border-black font-bold w-[15%] text-center">PRECIO</th>
                <th className="py-2 px-3 border border-black font-bold w-[20%] text-center">SUB-TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td className="py-3 px-3 border-x border-black align-top text-center">{item.codigo}</td>
                  <td className="py-3 px-3 border-x border-black align-top whitespace-pre-wrap">
                    {item.descripcion}
                    {/* Si es m2 y tiene medidas, mostrar en impresión para justificar la cantidad */}
                    {item.tipo === 'm2' && item.largo && item.ancho && (
                      <span className="block text-gray-500 italic mt-1 text-[11px]">
                        (Medidas: {item.largo}m x {item.ancho}m)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 border-x border-black align-top text-center">
                    {item.tipo === 'm2' ? Number(item.cantidad).toFixed(2) : item.cantidad}
                  </td>
                  <td className="py-3 px-3 border-x border-black align-top text-right">
                    {formatearMoneda(item.precio)}
                  </td>
                  <td className="py-3 px-3 border-x border-black align-top text-right font-medium">
                    {formatearMoneda(item.total)}
                  </td>
                </tr>
              ))}
              {/* Espaciador para asegurar que la tabla tenga cierta altura mínima */}
              <tr>
                <td className="py-10 border-x border-black"></td>
                <td className="border-x border-black"></td>
                <td className="border-x border-black"></td>
                <td className="border-x border-black"></td>
                <td className="border-x border-black"></td>
              </tr>
            </tbody>
          </table>

          {/* Tabla de Totales (Alineada a la derecha) */}
          <div className="flex justify-end mt-[-1px]">
            <table className="w-64 border-collapse">
              <tbody>
                <tr>
                  <td className="py-1.5 px-3 border border-black bg-[#f0f0f0] font-bold text-right w-1/2">Subtotal</td>
                  <td className="py-1.5 px-3 border border-black text-right font-medium w-1/2">{formatearMoneda(subtotal)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3 border border-black bg-[#f0f0f0] font-bold text-right">I.G.V.</td>
                  <td className="py-1.5 px-3 border border-black text-right font-medium">{formatearMoneda(igv)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3 border border-black bg-[#f0f0f0] font-bold text-right text-[14px]">TOTAL</td>
                  <td className="py-1.5 px-3 border border-black text-right font-bold text-[14px]">{formatearMoneda(totalGeneral)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Términos y Condiciones */}
        <div className="mt-8">
          <p className="font-bold text-[13px] mb-4">NOTA: El tiempo de elaboracion e instalacion es de {tiempoEntrega}.</p>
          
          <h3 className="font-bold text-[14px] mb-2 underline">TERMINOS Y CONDICIONES</h3>
          <p className="mb-1">1. El pago se realizara:</p>
          <ul className="list-disc pl-8 mb-4">
            <li>60% de adelanto</li>
            <li>40% a la entrega de la obra</li>
          </ul>
          
          <p className="mb-2">
            Abonar en la <span className="font-bold">Cta Cte. No 191-2650527-0-98 CCI 00219100265052709858</span> Banco de Crédito (BCP).
          </p>
        </div>

        {/* Sección de Firma */}
        <div className="mt-16 pt-8 max-w-sm">
          <p className="mb-10 font-medium">La aceptación del cliente (firmar a continuación)</p>
          <div className="border-t border-black pt-2">
            <p>Nombre del cliente: <span className="font-bold">{cliente}</span></p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-gray-500 border-t border-gray-300 pt-4 text-[11px]">
          <p>Si usted tiene alguna pregunta sobre esta cotización, por favor, póngase en contacto con nosotros</p>
          <p className="font-bold mt-1">IMPORTACIONES LUTHIPLAST EIRL | Teléfono: 992 753 053 | E-mail: miguel@luthiplast.com</p>
          <p className="italic mt-1">¡Gracias por hacer negocios con nosotros!</p>
        </div>

      </div>

    </div>
  );
};

export default App;
