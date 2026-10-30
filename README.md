# Simulador Planta El Salado

Simulador de abastecimiento y costos de la Planta RioSal (El Salado, Chañaral): faenas mineras por radio y distancia por camino,
explotación propia o compra de mineral, ficha de costos por mina y balance mensual de la planta.

Publicado en GitHub Pages: <https://nexore-tech.github.io/simulador-el-salado/>

## Acceso

- Solo se entra con **Google**. La lista de usuarios autorizados y sus roles está en Firestore (`usuarios/{correo}`).
- Los **administradores** agregan, desactivan o eliminan usuarios y suben los datos desde `admin.html`.
- Los datos del simulador **no están en este repositorio**: viven en Firestore (`datos/`) y las reglas
  (`firestore.rules`) solo dejan leerlos a usuarios activos. Este repositorio es público: contiene solo el código.

## Puesta en marcha de Firebase (una vez)

1. <https://console.firebase.google.com> → **Agregar proyecto** → nombre `simulador-el-salado` → sin Google Analytics.
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
