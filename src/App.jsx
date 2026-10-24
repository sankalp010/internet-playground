import { useCallback, useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'

const experiments = [
  { id: 'runaway', number: '01', title: 'Runaway buttons', note: 'They have places to be.' },
  { id: 'gravity', number: '02', title: 'Gravity mode', note: 'Everything comes down eventually.' },
  { id: 'chaos', number: '03', title: 'Cursor chaos', note: 'Your pointer has a pulse.' },
  { id: 'rebel', number: '04', title: 'Rebellious interface', note: 'The layout has other plans.' },
]

const colors = ['#d27a53', '#8d9871', '#8796a2', '#b76d63', '#d0b17b']
const taunts = [
  ['Too slow', 'Nice try', 'Missed me', 'Again?'],
  ['Not even close', 'Keep up', 'So close', 'Try harder'],
]

function isCornered(stageRect, buttonRect) {
  const nearHorizontalEdge = buttonRect.left - stageRect.left < 70 || stageRect.right - buttonRect.right < 70
  const nearVerticalEdge = buttonRect.top - stageRect.top < 70 || stageRect.bottom - buttonRect.bottom < 70
  return nearHorizontalEdge && nearVerticalEdge
}

function createBlock(x, y, index) {
  const size = 29 + (index % 4) * 4
  const options = { restitution: 0.48, friction: 0.13, frictionAir: 0.008, label: ['DOT', 'BLOCK', 'TRI', 'FIVE'][index % 4] }
  let body
  if (index % 4 === 0) body = Matter.Bodies.circle(x, y, size * 0.52, options)
  else if (index % 4 === 1) body = Matter.Bodies.rectangle(x, y, size * 1.55, size, options)
  else body = Matter.Bodies.polygon(x, y, index % 4 === 2 ? 3 : 5, size * 0.72, options)
  body.plugin = { color: colors[index % colors.length], clearAt: null }
  return body
}

function PhysicsCanvas({ mode, gravityEnabled, resetKey, reducedMotion, onPointer }) {
  const canvasRef = useRef(null)
  const layerRef = useRef(null)
  const engineRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const layer = layerRef.current
    if (!canvas || !layer) return undefined
    const context = canvas.getContext('2d')
    const engine = mode === 'gravity' ? Matter.Engine.create({ enableSleeping: true }) : null
    if (engine) {
      engine.gravity.y = gravityEnabled ? 1 : 0
      engineRef.current = engine
    }

    let width = 0
    let height = 0
    let dpr = 1
    let walls = []
    let bodies = []
    let particles = []
    let trails = []
    let drag = null
    let lastCursor = null
    let liveParticles = 0
    let emptyAt = null
    let phase = 'active'
    let capacity = 0
    let leakBody = null
    let cascadeAt = 0
    let blockIndex = 0
    let active = true
    let frame = 0
    let lastTime = performance.now()

    const pointFromEvent = (event) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const makeWalls = () => {
      if (!engine) return
      Matter.World.clear(engine.world, false)
      const thickness = 72
      walls = [
        Matter.Bodies.rectangle(width / 2, height + thickness / 2 - 6, width + thickness * 2, thickness, { isStatic: true, label: 'floor' }),
        Matter.Bodies.rectangle(-thickness / 2 + 6, height / 2, thickness, height + thickness * 2, { isStatic: true, label: 'left wall' }),
        Matter.Bodies.rectangle(width + thickness / 2 - 6, height / 2, thickness, height + thickness * 2, { isStatic: true, label: 'right wall' }),
      ]
      Matter.Composite.add(engine.world, walls)
    }

    const seedBlocks = () => {
      if (!engine) return
      phase = 'active'
      leakBody = null
      bodies = []
      blockIndex = 0
      makeWalls()
      const seedCount = Math.max(5, Math.min(8, Math.floor(width / 100)))
      for (let index = 0; index < seedCount; index += 1) {
        const x = width * (0.18 + (index % 4) * 0.21)
        const y = -30 - Math.floor(index / 4) * 50
        bodies.push(createBlock(x, y, blockIndex++))
      }
      Matter.Composite.add(engine.world, bodies)
    }

    const createParticleField = () => {
      const columns = Math.ceil(width / 24)
      const rows = Math.ceil(height / 24)
      particles = []
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          particles.push({
            x: ((column + 0.25 + Math.random() * 0.5) * width) / columns,
            y: ((row + 0.25 + Math.random() * 0.5) * height) / rows,
            radius: 1.4 + Math.random() * 2.1,
            color: colors[Math.floor(Math.random() * colors.length)],
            fadeAt: null,
          })
        }
      }
      liveParticles = particles.length
      emptyAt = null
      trails = []
      lastCursor = null
    }

    const resize = () => {
      const rect = layer.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (mode === 'gravity') {
        capacity = Math.max(24, Math.min(96, Math.ceil((width * height) / 2700)))
        seedBlocks()
      } else if (mode === 'chaos') {
        createParticleField()
      }
    }

    const startLeak = () => {
      if (!engine || phase !== 'active') return
      phase = 'leaking'
      const rightWall = walls.find((wall) => wall.label === 'right wall')
      if (rightWall) Matter.Composite.remove(engine.world, rightWall)
      const wallWidth = 72
      const exitHeight = 112
      const exitCenter = height * 0.56
      const upperHeight = Math.max(20, exitCenter - exitHeight / 2)
      const lowerTop = exitCenter + exitHeight / 2
      const segments = [
        Matter.Bodies.rectangle(width + wallWidth / 2 - 6, upperHeight / 2, wallWidth, upperHeight, { isStatic: true, label: 'leak wall' }),
        Matter.Bodies.rectangle(width + wallWidth / 2 - 6, lowerTop + (height - lowerTop) / 2, wallWidth, Math.max(20, height - lowerTop), { isStatic: true, label: 'leak wall' }),
      ]
      Matter.Composite.add(engine.world, segments)
      walls = walls.filter((wall) => wall !== rightWall).concat(segments)
      leakBody = bodies.reduce((closest, body) => {
        const distance = Math.hypot(width - body.position.x, exitCenter - body.position.y)
        return !closest || distance < closest.distance ? { body, distance } : closest
      }, null)?.body ?? bodies[0]
      if (leakBody) {
        leakBody.isSensor = true
        Matter.Body.setVelocity(leakBody, { x: 5, y: -1 })
      }
    }

    const spawnBatch = () => {
      if (!engine || phase !== 'active') return
      const count = Math.min(3, capacity - bodies.length)
      for (let index = 0; index < count; index += 1) {
        const margin = 42
        const x = margin + Math.random() * Math.max(1, width - margin * 2)
        const y = -35 - Math.random() * 80
        const body = createBlock(x, y, blockIndex++)
        bodies.push(body)
        Matter.Composite.add(engine.world, body)
      }
      if (bodies.length >= capacity) startLeak()
    }

    const beginCascade = (time) => {
      if (phase !== 'leaking') return
      phase = 'clearing'
      cascadeAt = time
      bodies.forEach((body, index) => {
        body.plugin.clearAt = time + index * 28
        body.isSensor = true
        Matter.Body.setStatic(body, true)
      })
    }

    const eraseAlong = (from, to, time) => {
      if (!from || mode !== 'chaos') return
      const distance = Math.hypot(to.x - from.x, to.y - from.y)
      const samples = Math.max(1, Math.ceil(distance / 9))
      for (let step = 0; step <= samples; step += 1) {
        const progress = step / samples
        const x = from.x + (to.x - from.x) * progress
        const y = from.y + (to.y - from.y) * progress
        trails.push({ x, y, time })
        for (const particle of particles) {
          if (particle.fadeAt !== null) continue
          if (Math.hypot(particle.x - x, particle.y - y) < 40) {
            particle.fadeAt = time
            liveParticles -= 1
          }
        }
      }
      if (liveParticles === 0 && emptyAt === null) emptyAt = time
    }

    const render = (time) => {
      if (!active) return
      if (engine) {
        engine.timing.timeScale = reducedMotion ? 0.55 : 1
        Matter.Engine.update(engine, Math.min(time - lastTime, 32))
        lastTime = time
      }
      context.clearRect(0, 0, width, height)

      if (mode === 'gravity' && engine) {
        if (phase === 'leaking' && leakBody) {
          Matter.Body.applyForce(leakBody, leakBody.position, { x: 0.0018, y: -0.0001 })
          if (leakBody.position.x > width + 55) beginCascade(time)
        }
        if (phase === 'clearing' && time >= cascadeAt + bodies.length * 28 + 360) {
          seedBlocks()
        }
        for (const body of bodies) {
          const vertices = body.vertices
          let opacity = 1
          if (body.plugin.clearAt !== null) opacity = Math.max(0, 1 - (time - body.plugin.clearAt) / 360)
          if (opacity <= 0) continue
          context.globalAlpha = opacity
          context.beginPath()
          if (body.circleRadius) {
            context.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2)
          } else {
            context.moveTo(vertices[0].x, vertices[0].y)
            for (let index = 1; index < vertices.length; index += 1) context.lineTo(vertices[index].x, vertices[index].y)
            context.closePath()
          }
          context.fillStyle = body.plugin.color
          context.fill()
          context.strokeStyle = 'rgba(21, 21, 21, .48)'
          context.lineWidth = 1
          context.stroke()
          context.save()
          context.translate(body.position.x, body.position.y)
          context.rotate(body.angle)
          context.fillStyle = '#201d1a'
          context.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText(body.label, 0, 0)
          context.restore()
          context.globalAlpha = 1
        }
      }

      if (mode === 'chaos') {
        for (const particle of particles) {
          const opacity = particle.fadeAt === null ? 1 : Math.max(0, 1 - (time - particle.fadeAt) / 250)
          if (opacity <= 0) continue
          context.globalAlpha = opacity
          context.beginPath()
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
          context.fillStyle = particle.color
          context.fill()
        }
        context.globalAlpha = 1
        trails = trails.filter((trail) => time - trail.time < 650).slice(-220)
        trails.forEach((trail) => {
          const age = (time - trail.time) / 650
          context.beginPath()
          context.arc(trail.x, trail.y, 2 + (1 - age) * 5, 0, Math.PI * 2)
          context.fillStyle = `rgba(210, 122, 83, ${(1 - age) * 0.48})`
          context.fill()
        })
        if (liveParticles === 0 && emptyAt !== null && time - emptyAt > 900) createParticleField()
      }

      frame = requestAnimationFrame(render)
    }

    const handlePointerDown = (event) => {
      if (mode !== 'gravity' || !engine || phase !== 'active') return
      const point = pointFromEvent(event)
      const body = Matter.Query.point(bodies, point)[0]
      if (!body) return
      event.preventDefault()
      canvas.setPointerCapture?.(event.pointerId)
      drag = { body, start: point, current: point, previous: point, previousStatic: body.isStatic }
      Matter.Body.setStatic(body, true)
      Matter.Body.setPosition(body, point)
    }

    const handlePointerMove = (event) => {
      const point = pointFromEvent(event)
      onPointer?.(point)
      if (mode === 'chaos') {
        const origin = lastCursor ?? point
        eraseAlong(origin, point, performance.now())
        lastCursor = point
      }
      if (drag) {
        drag.previous = drag.current
        drag.current = point
        Matter.Body.setPosition(drag.body, point)
      }
    }

    const handlePointerUp = () => {
      if (!drag) return
      const currentDrag = drag
      drag = null
      if (!currentDrag.previousStatic) Matter.Body.setStatic(currentDrag.body, false)
      const dx = currentDrag.current.x - currentDrag.previous.x
      const dy = currentDrag.current.y - currentDrag.previous.y
      if (!currentDrag.previousStatic) Matter.Body.setVelocity(currentDrag.body, { x: dx * 0.16, y: dy * 0.16 })
      if (currentDrag.start.y - currentDrag.current.y >= 58) spawnBatch()
    }

    const handlePointerCancel = () => {
      if (!drag) return
      if (!drag.previousStatic) Matter.Body.setStatic(drag.body, false)
      Matter.Body.setVelocity(drag.body, { x: 0, y: 0 })
      drag = null
    }
    const handleKeyDown = (event) => {
      const force = {
        ArrowUp: { x: 0, y: -0.00055 },
        ArrowDown: { x: 0, y: 0.00055 },
        ArrowLeft: { x: -0.00055, y: 0 },
        ArrowRight: { x: 0.00055, y: 0 },
      }[event.key]
      if (!force || !engine || (mode !== 'gravity' && mode !== 'chaos')) return
      event.preventDefault()
      bodies.forEach((body) => Matter.Body.applyForce(body, body.position, force))
    }
    const handleLeave = () => { lastCursor = null }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(layer)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove, { passive: true })
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)
    canvas.addEventListener('pointerleave', handleLeave)
    canvas.addEventListener('keydown', handleKeyDown)
    frame = requestAnimationFrame(render)

    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      canvas.removeEventListener('pointerleave', handleLeave)
      canvas.removeEventListener('keydown', handleKeyDown)
      if (engine) {
        Matter.Composite.clear(engine.world, false)
        Matter.Engine.clear(engine)
        if (engineRef.current === engine) engineRef.current = null
      }
    }
  }, [mode, resetKey, reducedMotion, onPointer])

  useEffect(() => {
    if (engineRef.current) engineRef.current.gravity.y = gravityEnabled ? 1 : 0
  }, [gravityEnabled, mode])

  return (
    <div ref={layerRef} className="physics-layer">
      <canvas ref={canvasRef} tabIndex={mode === 'gravity' || mode === 'chaos' ? 0 : -1} role="application" aria-label="Interactive canvas. Use arrow keys to nudge objects in physics modes." />
    </div>
  )
}

function DraggableRebel() {
  const phraseRef = useRef(null)
  const returnTimer = useRef(null)
  const originalOffset = useRef({ x: 0, y: 0 })
  const dragOrigin = useRef(null)

  useEffect(() => () => window.clearTimeout(returnTimer.current), [])

  const readOffset = (element) => {
    const value = getComputedStyle(element).translate
    const parts = value.split(/\s+/)
    return { x: Number.parseFloat(parts[0]) || 0, y: Number.parseFloat(parts[1]) || 0 }
  }

  const startReturnTimer = () => {
    window.clearTimeout(returnTimer.current)
    returnTimer.current = window.setTimeout(() => {
      const element = phraseRef.current
      if (!element) return
      element.style.transition = 'translate 850ms cubic-bezier(.2,.8,.2,1)'
      element.style.translate = '0px 0px'
    }, 2000)
  }

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const element = phraseRef.current
    if (!element) return
    event.preventDefault()
    window.clearTimeout(returnTimer.current)
    originalOffset.current = readOffset(element)
    dragOrigin.current = { x: event.clientX, y: event.clientY }
    element.style.transition = 'none'
    element.classList.add('is-dragging')
    element.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event) => {
    if (!dragOrigin.current || !phraseRef.current) return
    const element = phraseRef.current
    const x = originalOffset.current.x + event.clientX - dragOrigin.current.x
    const y = originalOffset.current.y + event.clientY - dragOrigin.current.y
    element.style.translate = `${x}px ${y}px`
  }

  const onPointerUp = () => {
    if (!dragOrigin.current || !phraseRef.current) return
    dragOrigin.current = null
    phraseRef.current.classList.remove('is-dragging')
    startReturnTimer()
  }

  const onKeyDown = (event) => {
    const increments = {
      ArrowUp: [0, -18], ArrowDown: [0, 18], ArrowLeft: [-18, 0], ArrowRight: [18, 0],
    }
    const [dx, dy] = increments[event.key] ?? []
    if (dx === undefined) return
    event.preventDefault()
    const element = phraseRef.current
    if (!element) return
    window.clearTimeout(returnTimer.current)
    const offset = readOffset(element)
    element.style.transition = 'translate 160ms ease-out'
    element.style.translate = `${offset.x + dx}px ${offset.y + dy}px`
    startReturnTimer()
  }

  const clearReturnTransition = (event) => {
    if (event.propertyName !== 'translate') return
    const element = phraseRef.current
    if (element?.style.translate === '0px 0px') element.style.transition = ''
  }

  return (
    <div
      ref={phraseRef}
      className="rebel-type"
      role="group"
      aria-label="Draggable text: Move me around please. Use arrow keys to move it."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onTransitionEnd={clearReturnTransition}
    >
      <span>MOVE</span><span>ME</span><span>AROUND</span><span>PLEASE</span>
    </div>
  )
}

function App() {
  const [active, setActive] = useState('runaway')
  const [gravityEnabled, setGravityEnabled] = useState(true)
  const [resetKey, setResetKey] = useState(0)
  const [caught, setCaught] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [runawayPositions, setRunawayPositions] = useState([{ x: 36, y: 39 }, { x: 67, y: 62 }])
  const [runawayLabels, setRunawayLabels] = useState(['Click me', 'Not so fast'])
  const tauntIndex = useRef([0, 0])
  const stageRef = useRef(null)
  const introRef = useRef(null)
  const headlineRef = useRef(null)
  const heroAccentsRef = useRef([])
  const caughtTimer = useRef(null)
  const currentExperiment = experiments.find((experiment) => experiment.id === active)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => () => window.clearTimeout(caughtTimer.current), [])

  useEffect(() => {
    const intro = introRef.current
    const headline = headlineRef.current
    const accents = heroAccentsRef.current.filter(Boolean)
    if (!intro || !headline || accents.length !== 4) return undefined

    let frame = 0
    let previousTime = performance.now()
    let bounds = null
    let motion = []
    let activeMotion = !reducedMotion

    const intersectsHeadline = (item, x, y) => {
      const left = item.rect.left + x
      const right = item.rect.right + x
      const top = item.rect.top + y
      const bottom = item.rect.bottom + y
      const rect = bounds.headline
      return left < rect.right + 8 && right > rect.left - 8
        && top < rect.bottom + 8 && bottom > rect.top - 8
    }

    const intersectsAccent = (first, firstX, firstY, second, secondX, secondY) => {
      const gap = 5
      const firstLeft = first.rect.left + firstX
      const firstRight = first.rect.right + firstX
      const firstTop = first.rect.top + firstY
      const firstBottom = first.rect.bottom + firstY
      const secondLeft = second.rect.left + secondX
      const secondRight = second.rect.right + secondX
      const secondTop = second.rect.top + secondY
      const secondBottom = second.rect.bottom + secondY
      return firstLeft < secondRight + gap && firstRight + gap > secondLeft
        && firstTop < secondBottom + gap && firstBottom + gap > secondTop
    }

    const measure = () => {
      accents.forEach((element) => { element.style.translate = '0px 0px' })
      bounds = { hero: intro.getBoundingClientRect(), headline: headline.getBoundingClientRect() }
      motion = accents.map((element) => {
        const rect = element.getBoundingClientRect()
        const angle = Math.random() * Math.PI * 2
        const speed = 18 + Math.random() * 10
        return { element, rect, x: 0, y: 0, speed, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }
      })
      previousTime = performance.now()
    }

    const tick = (time) => {
      if (!activeMotion) return
      const delta = Math.min((time - previousTime) / 1000, 0.04)
      previousTime = time

      const candidates = motion.map((item) => {
        const angle = Math.atan2(item.vy, item.vx) + (Math.random() - 0.5) * 0.36 * delta
        item.vx = Math.cos(angle) * item.speed
        item.vy = Math.sin(angle) * item.speed

        const minX = bounds.hero.left - item.rect.left
        const maxX = bounds.hero.right - item.rect.right
        const minY = bounds.hero.top - item.rect.top
        const maxY = bounds.hero.bottom - item.rect.bottom
        let nextX = item.x + item.vx * delta
        let nextY = item.y + item.vy * delta

        if (nextX < minX) { nextX = minX; item.vx = Math.abs(item.vx) }
        if (nextX > maxX) { nextX = maxX; item.vx = -Math.abs(item.vx) }
        if (nextY < minY) { nextY = minY; item.vy = Math.abs(item.vy) }
        if (nextY > maxY) { nextY = maxY; item.vy = -Math.abs(item.vy) }

        if (intersectsHeadline(item, nextX, item.y)) {
          nextX = item.x
          item.vx = -item.vx
        }
        if (intersectsHeadline(item, nextX, nextY)) {
          nextY = item.y
          item.vy = -item.vy
        }
        if (intersectsHeadline(item, nextX, nextY)) {
          nextX = item.x
          nextY = item.y
          item.vx = -item.vx
          item.vy = -item.vy
        }

        return { item, x: nextX, y: nextY }
      })

      for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
          const first = candidates[firstIndex]
          const second = candidates[secondIndex]
          if (!intersectsAccent(first.item, first.x, first.y, second.item, second.x, second.y)) continue

          const firstLeft = first.item.rect.left + first.x
          const firstRight = first.item.rect.right + first.x
          const firstTop = first.item.rect.top + first.y
          const firstBottom = first.item.rect.bottom + first.y
          const secondLeft = second.item.rect.left + second.x
          const secondRight = second.item.rect.right + second.x
          const secondTop = second.item.rect.top + second.y
          const secondBottom = second.item.rect.bottom + second.y
          const overlapX = Math.min(firstRight, secondRight) - Math.max(firstLeft, secondLeft)
          const overlapY = Math.min(firstBottom, secondBottom) - Math.max(firstTop, secondTop)
          const horizontalCollision = overlapX < 0 && overlapY < 0
            ? overlapX > overlapY
            : overlapX < 0 || (overlapY >= 0 && overlapX <= overlapY)
          const firstCenter = horizontalCollision
            ? (firstLeft + firstRight) / 2
            : (firstTop + firstBottom) / 2
          const secondCenter = horizontalCollision
            ? (secondLeft + secondRight) / 2
            : (secondTop + secondBottom) / 2
          const firstVelocity = horizontalCollision ? first.item.vx : first.item.vy
          const secondVelocity = horizontalCollision ? second.item.vx : second.item.vy
          const separationVelocity = firstCenter < secondCenter
            ? secondVelocity - firstVelocity
            : firstVelocity - secondVelocity
          if (separationVelocity > 0) continue

          if (horizontalCollision) {
            first.x = first.item.x
            second.x = second.item.x
            first.item.vx = -first.item.vx
            second.item.vx = -second.item.vx
          } else {
            first.y = first.item.y
            second.y = second.item.y
            first.item.vy = -first.item.vy
            second.item.vy = -second.item.vy
          }
        }
      }

      candidates.forEach(({ item, x, y }) => {
        if (intersectsHeadline(item, x, y)) {
          item.vx = -item.vx
          item.vy = -item.vy
          x = item.x
          y = item.y
        }
        item.x = x
        item.y = y
        item.element.style.translate = `${item.x.toFixed(2)}px ${item.y.toFixed(2)}px`
      })
      frame = requestAnimationFrame(tick)
    }

    if (reducedMotion) {
      accents.forEach((element) => { element.style.translate = '0px 0px' })
      return undefined
    }

    measure()
    const observer = new ResizeObserver(() => {
      if (!activeMotion) return
      measure()
    })
    observer.observe(intro)
    observer.observe(headline)
    frame = requestAnimationFrame(tick)

    return () => {
      activeMotion = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      accents.forEach((element) => { element.style.translate = '0px 0px' })
    }
  }, [reducedMotion])

  const chooseExperiment = useCallback((id) => {
    setActive(id)
    setCaught(false)
  }, [])

  const nextTaunt = useCallback((index) => {
    tauntIndex.current[index] = (tauntIndex.current[index] + 1) % taunts[index].length
    setRunawayLabels((current) => current.map((label, buttonIndex) => buttonIndex === index ? taunts[index][tauntIndex.current[index]] : label))
  }, [])

  const moveButton = useCallback((index) => {
    setRunawayPositions((positions) => positions.map((position, itemIndex) => {
      if (itemIndex !== index) return position
      let x = 10 + Math.random() * 80
      let y = 15 + Math.random() * 70
      if (Math.abs(position.x - x) < 22) x = x < 50 ? Math.min(90, x + 25) : Math.max(10, x - 25)
      if (Math.abs(position.y - y) < 18) y = y < 50 ? Math.min(85, y + 23) : Math.max(15, y - 23)
      return { x, y }
    }))
    nextTaunt(index)
  }, [nextTaunt])

  const handleStagePointer = useCallback((point) => {
    if (active !== 'runaway' || caught) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const buttons = stage.querySelectorAll('.runaway-button')
    runawayPositions.forEach((position, index) => {
      const buttonRect = buttons[index]?.getBoundingClientRect()
      if (!buttonRect || isCornered(rect, buttonRect)) return
      const x = buttonRect.left - rect.left + buttonRect.width / 2
      const y = buttonRect.top - rect.top + buttonRect.height / 2
      if (Math.hypot(point.x - x, point.y - y) < 84) moveButton(index)
    })
  }, [active, caught, moveButton, runawayPositions])

  const handleRunawayPointerEnter = (index, event) => {
    const stage = stageRef.current
    if (!stage || caught) return
    const stageRect = stage.getBoundingClientRect()
    if (isCornered(stageRect, event.currentTarget.getBoundingClientRect())) return
    moveButton(index)
  }

  const catchButton = (event) => {
    event.preventDefault()
    setCaught(true)
    window.clearTimeout(caughtTimer.current)
    caughtTimer.current = window.setTimeout(() => setCaught(false), 1800)
  }

  const reset = () => {
    setResetKey((value) => value + 1)
    setCaught(false)
    tauntIndex.current = [0, 0]
    setRunawayLabels(['Click me', 'Not so fast'])
    setRunawayPositions([{ x: 36, y: 39 }, { x: 67, y: 62 }])
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Internet Playground home"><span className="wordmark-mark" aria-hidden="true">✳</span><span>Internet<br />Playground</span></a>
        <p className="top-note">A small study in<br />disobedient interfaces</p>
        <a className="top-link" href="#play">Enter the playfield <span aria-hidden="true">↘</span></a>
      </header>

      <section ref={introRef} className="intro" id="top" aria-labelledby="headline">
        <div className="intro-side"><span ref={(element) => { heroAccentsRef.current[0] = element }} className="eyebrow">An interactive experiment</span><span ref={(element) => { heroAccentsRef.current[1] = element }} className="scribble" aria-hidden="true">try to behave</span></div>
        <h1 ref={headlineRef} id="headline">The internet<br />has <em>other plans.</em></h1>
        <p ref={(element) => { heroAccentsRef.current[2] = element }} className="intro-copy">A place where buttons dodge, objects tumble, and the cursor leaves a little trouble behind.</p>
        <span ref={(element) => { heroAccentsRef.current[3] = element }} className="asterisk" aria-hidden="true">✳</span>
      </section>

      <section className="playground" id="play" aria-label="Interactive playground">
        <div className="playground-heading">
          <div><span className="eyebrow">Choose your experiment</span><h2>Touch the interface.</h2></div>
          <div className="play-controls">
            <button className={`text-control ${gravityEnabled ? 'is-on' : ''}`} type="button" onClick={() => setGravityEnabled((value) => !value)} aria-pressed={gravityEnabled}>
              <span className="toggle-mark" aria-hidden="true">{gravityEnabled ? '●' : '○'}</span> Gravity {gravityEnabled ? 'on' : 'off'}
            </button>
            <button className="text-control reset-control" type="button" onClick={reset}><span aria-hidden="true">↺</span> Reset</button>
          </div>
        </div>

        <nav className="experiment-nav" aria-label="Experiments">
          {experiments.map((experiment) => (
            <button key={experiment.id} className={`experiment-tab ${active === experiment.id ? 'active' : ''}`} type="button" onClick={() => chooseExperiment(experiment.id)} aria-pressed={active === experiment.id}>
              <span className="experiment-number">{experiment.number}</span><span>{experiment.title}</span><span className="tab-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </nav>

        <div ref={stageRef} className={`arena arena-${active} ${reducedMotion ? 'reduced-motion' : ''}`}>
          <div className="arena-grid" aria-hidden="true" />
          <PhysicsCanvas mode={active} gravityEnabled={gravityEnabled} resetKey={resetKey} reducedMotion={reducedMotion} onPointer={handleStagePointer} />
          <div className="arena-label"><span>Now playing</span><strong>{currentExperiment.title}</strong></div>
          <div className="arena-instruction" aria-live="polite">
            {active === 'runaway' && 'Get close. Corner a button to catch it.'}
            {active === 'gravity' && 'Drag a block upward to call in another wave.'}
            {active === 'chaos' && 'Move or press to clear the field.'}
            {active === 'rebel' && 'Drag the words. They have a short memory.'}
          </div>
          {active === 'runaway' && (
            <div className={`runaway-layer ${caught ? 'caught' : ''}`}>
              {runawayPositions.map((position, index) => (
                <button key={index} className="runaway-button" type="button" style={{ left: `${position.x}%`, top: `${position.y}%` }} onPointerEnter={(event) => handleRunawayPointerEnter(index, event)} onPointerDown={(event) => { if (event.pointerType === 'touch') handleRunawayPointerEnter(index, event) }} onClick={catchButton}>
                  <span key={caught ? 'caught' : runawayLabels[index]} className="taunt-label">{caught ? 'Got you!' : runawayLabels[index]}</span>
                </button>
              ))}
            </div>
          )}
          {active === 'rebel' && <div className="rebel-holder"><DraggableRebel /></div>}
          <span className="arena-corner corner-left" aria-hidden="true">✳</span><span className="arena-corner corner-right" aria-hidden="true">↗</span>
        </div>
        <div className="arena-caption"><span>{currentExperiment.note}</span><span>Use your mouse, touch, or keyboard</span></div>
      </section>

      <footer className="footer"><span>Made to be messed with.</span><span className="footer-center">A little disobedience <a className="back-to-top" href="#top" aria-label="Back to top">↑</a></span><span className="footer-credit">behindapi © 2026</span></footer>
    </main>
  )
}

export default App
