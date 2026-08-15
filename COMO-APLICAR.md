# Rediseño visual — cómo aplicarlo

Copiá el contenido de la carpeta `skin/` sobre tu proyecto `gym/`, respetando
las rutas. Cada archivo reemplaza al que ya está.

**Ningún archivo de lógica cambia.** No se tocan las Server Actions, ni los
clientes de Supabase, ni el SQL, ni `lib/types.ts`, ni `lib/labels.ts`.
Es puramente la capa visual.

## Archivos que se reemplazan

```
tailwind.config.ts                       ← paleta y escala nuevas
app/globals.css                          ← clases base
app/layout.tsx                           ← tipografías nuevas
app/login/page.tsx
app/login/LoginForm.tsx
app/panel/layout.tsx                     ← barra oscura
app/panel/PanelNav.tsx                   ← nav inferior en celular
app/panel/page.tsx                       ← resumen con datos reales
app/panel/acceso/page.tsx
app/panel/socios/page.tsx
app/panel/socios/SearchBox.tsx
app/panel/socios/nuevo/page.tsx
app/panel/socios/nuevo/NewMemberForm.tsx
app/panel/socios/[id]/page.tsx
app/panel/socios/[id]/MemberActions.tsx
app/panel/socios/[id]/EditMemberForm.tsx
app/panel/planes/page.tsx
app/panel/planes/PlanList.tsx
components/Avatar.tsx
components/Form.tsx
components/StatusBadge.tsx
components/UsesTally.tsx
```

## Después de copiar

Reiniciá el servidor. Tailwind lee su configuración al arrancar, así que un
cambio en `tailwind.config.ts` no se toma en caliente:

```
Ctrl+C
npm run dev
```

Si ves los estilos a medias o colores viejos, borrá la caché:

```
rm -rf .next
npm run dev
```

En Windows PowerShell: `Remove-Item -Recurse -Force .next`

## Qué cambió, en criterio

**Paleta con significado.** Los colores salen del código de discos de
competencia: rojo 25 kg, azul 20, amarillo 15, verde 10. El azul es la acción
primaria, el amarillo marca entradas disponibles, el verde confirma, el rojo
alerta. Ninguno es decorativo.

**Mayúsculas solo en etiquetas.** Antes cada título gritaba. Ahora los títulos
van en caja normal y las mayúsculas quedan donde funcionan: etiquetas cortas
de sección.

**Cromo oscuro contra contenido claro.** La barra superior en tinta ordena la
jerarquía. Antes todo flotaba al mismo nivel.

**Navegación abajo en el celular.** Vas a operar con una mano en el mostrador.
En escritorio las pestañas siguen arriba.

**Acciones destructivas plegadas.** Renovar un pase se hace todos los días;
borrar un socio, casi nunca. "Más acciones" refleja esa diferencia.

**El contador es lo más grande de la ficha.** Es el dato que se mira. Se le dio
fondo propio, tamaño grande y las marcas mejor dibujadas.

**Insignias con punto de color.** El color solo no alcanza para quien no lo
distingue, y el punto ayuda a escanear la lista sin leer.
