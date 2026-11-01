# Simulador Planta El Salado

Simulador de abastecimiento y costos de la Planta RioSal (El Salado, Chañaral): faenas mineras por radio y distancia por camino,
explotación propia o compra de mineral, ficha de costos por mina y balance mensual de la planta.

Publicado en GitHub Pages: <https://nexore-tech.github.io/simulador-el-salado/>

## Acceso

- Solo se entra con **Google**. La lista de usuarios autorizados y sus roles está en Firestore (`usuarios/{correo}`).
- Los **administradores** agregan, desactivan o eliminan usuarios y suben los datos desde `admin.html`.
- Los datos del simulador **no están en este repositorio**: viven en Firestore (`datos/`) y las reglas
  (`firestore.rules`) solo dejan leerlos a usuarios activos. Este repositorio es público: contiene solo el código.

## Proyecto Firebase

| | |
|---|---|
| Proyecto | `simulador-el-salado` (n.º 899742078264), plan Spark (gratuito) |
| Consola | <https://console.firebase.google.com/project/simulador-el-salado> |
| Authentication | Proveedor **Google**; dominio autorizado `nexore-tech.github.io`; nombre público "Simulador El Salado" |
| Firestore | Base `(default)`, edición Standard, `southamerica-west1` (Santiago); reglas = `firestore.rules` |
| App web | `simulador` → valores en `firebase-config.js` |
| Google Analytics | No se usa (desvinculado) |

Colecciones: `usuarios/{correo}` (rol `admin` o `usuario`, `activo`), `datos/meta` + `datos/parte_NN` (JSON del simulador
en partes de ~600 mil caracteres) y `accesos/` (entradas y salidas).

Si se cambia `firestore.rules`, hay que pegarlo de nuevo en **Firestore → Reglas → Publicar**: el repositorio no lo despliega solo.

## Crear el proyecto Firebase desde cero

Ya está hecho; estos pasos sirven solo para recrearlo en otro proyecto.

1. <https://console.firebase.google.com> → **Agregar proyecto** → nombre `simulador-el-salado` → sin Gemini ni Google Analytics.
2. **Compilación → Authentication → Comenzar** → *Método de acceso* → **Google** → Habilitar → correo de asistencia → Guardar.
3. **Authentication → Configuración → Dominios autorizados** → **Agregar dominio** → `nexore-tech.github.io`.
4. **Compilación → Firestore Database → Crear base de datos** → ubicación `southamerica-west1` (Santiago) → *modo de producción*.
5. **Firestore → Reglas** → pegar el contenido de `firestore.rules` → **Publicar**.
6. **Configuración del proyecto (engranaje) → Tus apps → Web (`</>`)** → apodo `simulador` → *Registrar app* (sin Hosting) →
   copiar `apiKey`, `authDomain`, `projectId` y `appId` en `firebase-config.js`.
7. Publicar el cambio (commit + push). El **propietario** (definido en `firestore.rules`) entra primero: queda como
   administrador, sube `data/datos_salado.json` en *Usuarios y datos* y agrega al resto de los usuarios.

Todo funciona en el plan gratuito (Spark): cada carga del simulador lee unos 6 documentos.

## Actualizar los datos

En el equipo de trabajo (fuera de este repositorio):

```
python tools/preparar_datos_salado.py      # genera data/datos_salado.json
```

y subir ese archivo en `admin.html` → *Datos del simulador*.

## Uso sin conexión

`local.html` (no publicado) abre el simulador con `data/datos_salado.js` sin login, solo en el equipo de trabajo.

## Exportar a Excel

El botón **Exportar Excel** genera `plan_el_salado_AAAA-MM-DD.xlsx` en el navegador (librería ExcelJS 4.4.0 desde cdnjs, se carga
solo al exportar). El libro trae el plan con **fórmulas**, no valores: hoja *Parámetros* (cada supuesto con nombre, p. ej. `Precio_Cu`),
*Minas* (una columna por faena, una fila por paso del cálculo) y *Balance* (balance mensual e indicadores, con una columna que compara
contra el valor del simulador). El libro incluye valores contractuales de la planta: es de uso interno.

`excel.js` replica en fórmulas el motor de `app.js` (`economia`, `evaluar`, `simular`): **si se cambia el motor, hay que cambiar también
`excel.js`**. Para verificar, exportar un plan y revisar que la columna *Diferencia* de la hoja *Balance* quede en 0 al abrirlo en Excel.
