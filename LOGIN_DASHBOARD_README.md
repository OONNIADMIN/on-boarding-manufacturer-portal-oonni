# Login y Dashboard - Documentación

Este documento describe las nuevas funcionalidades de autenticación y dashboard implementadas en el frontend.

## 📋 Funcionalidades Implementadas

### 1. Sistema de Autenticación
- **Página de Login** (`/login`) - Interfaz moderna y responsiva para autenticación
- **Gestión de Tokens** - Almacenamiento seguro en localStorage
- **API de Autenticación** - Funciones para login, logout y verificación de usuario

### 2. Dashboard de Administrador
- **Página de Dashboard** (`/dashboard`) - Panel de control exclusivo para administradores
- **Información del Usuario** - Visualización de datos del perfil
- **Acciones Rápidas** - Enlaces a funcionalidades principales
- **Protección de Rutas** - Verificación de permisos de admin

### 3. Navegación Mejorada
- **Header Dinámico** - Muestra información del usuario o botón de login
- **Redirección Inteligente** - Redirige según el rol del usuario
- **Acceso al Dashboard** - Botón visible solo para administradores

## 🚀 Uso

### Iniciar Sesión

1. Navega a `/login` o haz clic en el botón "Login" en la página principal
2. Ingresa tus credenciales:
   - Email: `admin@oonni.com` (o el email del admin creado)
   - Password: (la contraseña configurada)
3. Haz clic en "Sign in"

### Flujo de Redirección

- **Usuario Admin**: Redirigido a `/dashboard`
- **Usuario Normal**: Redirigido a la página principal `/`

### Acceder al Dashboard

El dashboard está disponible de dos formas:
1. Automáticamente después del login (si eres admin)
2. Haciendo clic en el botón "Dashboard" en el header (visible solo para admins)

### Cerrar Sesión

Haz clic en el botón "Logout" en:
- Header de la página principal
- Header del dashboard

## 📁 Estructura de Archivos

```
frontend/
├── app/
│   ├── login/
│   │   ├── page.tsx           # Página de login
│   │   └── page.module.css    # Estilos de login
│   ├── dashboard/
│   │   ├── page.tsx           # Página de dashboard
│   │   └── page.module.css    # Estilos de dashboard
│   ├── page.tsx               # Página principal (actualizada)
│   └── page.module.css        # Estilos (actualizados)
└── lib/
    └── api.ts                 # API con funciones de auth (actualizado)
```

## 🔐 Seguridad

### Almacenamiento de Datos
- **Token**: Guardado en `localStorage` como `access_token`
- **Usuario**: Guardado en `localStorage` como `user` (JSON)

### Protección de Rutas
- El dashboard verifica automáticamente:
  1. Si existe un token válido
  2. Si el usuario tiene rol de admin
  3. Redirige a login si no cumple las condiciones

## 🎨 Características de UI/UX

### Página de Login
- ✅ Diseño moderno con gradiente
- ✅ Formulario centrado y responsivo
- ✅ Validación en tiempo real
- ✅ Mensajes de error claros
- ✅ Estado de carga visual
- ✅ Animaciones suaves

### Dashboard
- ✅ Header con información del usuario
- ✅ Card de perfil con detalles
- ✅ Grid de acciones rápidas
- ✅ Iconos intuitivos
- ✅ Hover effects en tarjetas
- ✅ Diseño completamente responsivo

### Página Principal
- ✅ Header actualizado con estado de sesión
- ✅ Información del usuario visible
- ✅ Botón de dashboard para admins
- ✅ Transiciones suaves

## 🔄 API Endpoints Utilizados

### Backend (`/auth`)
- `POST /auth/login` - Autenticación de usuario
- `GET /auth/me` - Obtener información del usuario actual

### Respuesta del Login
```typescript
{
  access_token: string,
  token_type: string,
  user: {
    id: number,
    email: string,
    name: string,
    role: {
      id: number,
      name: string,
      description: string
    },
    // ... otros campos
  }
}
```

## 🧪 Testing

### Crear un Usuario Admin

Si aún no tienes un usuario admin, ejecuta en el backend:

```bash
cd backend
python create_admin.py
```

Esto creará un usuario admin con:
- Email: `admin@oonni.com`
- Password: (la que configures)

### Probar el Flujo Completo

1. **Login como Admin**:
   - Ve a `http://localhost:4200/login`
   - Ingresa credenciales de admin
   - Deberías ser redirigido a `/dashboard`

2. **Navegación**:
   - En el dashboard, haz clic en "Upload Catalogs" para volver a la página principal
   - En la página principal, verás tu nombre y rol en el header
   - Haz clic en "Dashboard" para volver al panel de control

3. **Logout**:
   - Haz clic en "Logout"
   - Serás redirigido a `/login`
   - El header ya no mostrará información del usuario

## 📱 Responsive Design

Todas las páginas están optimizadas para:
- 📱 Móviles (< 480px)
- 📱 Tablets (< 768px)
- 💻 Desktop (> 768px)

## 🛠️ Funciones de API Disponibles

```typescript
import { authAPI } from '@/lib/api'

// Login
await authAPI.login({ email, password })

// Obtener usuario actual
await authAPI.getCurrentUser(token)

// Logout
authAPI.logout()

// Obtener token almacenado
const token = authAPI.getToken()

// Obtener usuario almacenado
const user = authAPI.getStoredUser()

// Verificar si es admin
const isAdmin = authAPI.isAdmin(user)
```

## 🎯 Próximas Mejoras

Posibles mejoras futuras:
- [ ] Recuperación de contraseña
- [ ] Actualización de perfil
- [ ] Gestión de usuarios desde el dashboard
- [ ] Roles y permisos más granulares
- [ ] Protección de rutas con middleware
- [ ] Refresh token automático
- [ ] Notificaciones toast
- [ ] Historial de actividad

## 🐛 Troubleshooting

### No puedo acceder al dashboard
- Verifica que tu usuario tenga rol de "admin"
- Revisa que el backend esté corriendo
- Comprueba la consola del navegador para errores

### El login falla
- Verifica que el backend esté en `http://localhost:8000`
- Comprueba las credenciales
- Revisa que la base de datos tenga el usuario

### No veo mi información de usuario
- Limpia el localStorage del navegador
- Vuelve a iniciar sesión
- Verifica que la respuesta del backend incluya el campo `role`

## 📞 Soporte

Para más información sobre el backend, consulta:
- `backend/README.md`
- `backend/ROLES_GUIDE.md`
- `backend/ARCHITECTURE.md`

