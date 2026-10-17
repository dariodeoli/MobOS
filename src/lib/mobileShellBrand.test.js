import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const shell = readFileSync(new URL('../components/app/AppShell.jsx', import.meta.url), 'utf8')

test('marca móvil usa logo completo en viewport normal y conserva icono en pantallas estrechas', () => {
  assert.match(shell, /data-testid="shell-mobile-brand" className="hidden h-6 w-\[74px\] shrink-0 min-\[380px\]:block"/)
  assert.match(shell, /data-testid="shell-mobile-brand-icon"[^>]+min-\[380px\]:hidden/)
})

test('la campana conserva ancho y no se desplaza al colapsar el sidebar', () => {
  assert.match(shell, /data-testid=\{compact \? 'notificaciones-aviso-mobile' : 'notificaciones-aviso'\}[\s\S]*?min-h-11 min-w-11 shrink-0/)
  assert.match(shell, /collapsed && 'lg:w-16 lg:items-center'/)
  assert.match(shell, /collapsed && 'w-full items-center'/)
})
