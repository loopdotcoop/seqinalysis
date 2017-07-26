!function (ROOT) {

ROOT.sharedCache = {}

const
    d = document
  , $ = s => d.querySelector.call(d, s)
  , $$ = s => d.querySelectorAll.call(d, s)

let instances = {}, performBtns = [], performances = []
  , $out, $nav, $layered, layeredCanvasCtx, audioCtx
  , $sharedCache, $singleWaveformCache, $oscillationCache, $gainEnvelopeCache
  , $seqinDirectory, $seqinInstances
  , maxPerformanceSamples = 0
  , layeredWidth = ROOT.innerWidth - 16 // `-16` for 8px margins on each side
  , layeredHeight = 800 < ROOT.innerHeight ? 200 : 100
  , zoom = 1, scroll = 0 // zoom 1 fits everything in `layeredWidth`

  , performBtnTally = -1, colorSchemes = [
        [ 255,   0, 128 ] // magenta
      , [   0, 180, 255 ] // cyan
      , [   0, 220, 128 ] // green
      , [ 255, 220,   0 ] // yellow
      , [ 180,   0, 255 ] // violet
      , [ 128, 128, 255 ] // sky blue
      , [ 255,  64,   0 ] // orange

    ]
  , keypressShortcuts = [
        ['a','A']
      , ['b','B']
      , ['c','C']
      , ['d','D']
      , ['e','E']
      , ['f','F']
      , ['g','G']
      , ['h','H']
      , ['i','I']
      , ['j','J']
      , ['k','K']
      , ['l','L']
      , ['m','M']
      , ['n','N']
      , ['o','O']
      , ['p','P']
      , ['q','Q']
      , ['r','R']
      , ['s','S']
      , ['t','T']
      , ['u','U']
      , ['v','V']
      , ['w','W']
      , ['x','X']
      , ['y','Y']
      , ['z','Z']
    ]

ROOT.SEQINALYSIS = {

    //// Initialises the app.
    init: config => {

        $out = $('#seqinalysis')

        //// Create a nav-bar and fill it with the standard Seqinalysis buttons.
        $nav = d.createElement('nav')
        $nav.innerHTML = navButtons()
        $out.appendChild($nav)

        //// Create a directory of Seqins which are available to load.
        $seqinDirectory = d.createElement('div')
        $seqinDirectory.className = 'seqin-directory'
        for (let familyId in ROOT.SEQIN.directory) {
            if ('CDN' == familyId || 'META' == familyId) continue
            let family = ROOT.SEQIN.directory[familyId]
              , $family = d.createElement('div')
              , isLoaded = ROOT.SEQIN[family.META.NAME]
            $family.className = isLoaded ? 'loaded' : 'not-loaded'
            $family.id = `directory-${family.META.ID}`
            $family.innerHTML = `<h4>${family.META.NAME} ${loadButton(family.META.NAME, familyId)}</h4>`
            let seqinTally = 0
            for (let seqinId in family) {
                if ('CDN' == seqinId || 'META' == seqinId) continue
                let seqin = family[seqinId]
                  , $seqin = d.createElement('div')
                  , isLoaded = ROOT.SEQIN[seqin.META.NAME]
                $seqin.className = isLoaded ? 'loaded' : 'not-loaded'
                $seqin.id = `directory-${seqin.META.ID}`
                $seqin.innerHTML =
                  `<p>${seqin.META.NAME} ${loadButton(seqin.META.NAME, familyId, seqinId)} ${instantiateButton(seqin.META.NAME, familyId, seqinId)}</p>`
                $family.appendChild($seqin)
                seqinTally++
            }
            if (0 === seqinTally) {
                $family.innerHTML += `<p>(No Seqins in this family)</p>`
            }
            $seqinDirectory.appendChild($family)
        }
        $nav.appendChild($seqinDirectory)

        //// Create a canvas to visualise performances layered on top of each other.
        const $clearBoth = d.createElement('div')
        $clearBoth.style.clear = 'both'
        $out.appendChild($clearBoth)

        //// Create a canvas to visualise performances layered on top of each other.
        const $layeredWrap = d.createElement('div')
        $layeredWrap.className = 'layered-visualiser-wrap'
        $layeredWrap.height = layeredHeight
        $layered = d.createElement('canvas')
        $layered.className = 'layered-visualiser'
        $layered.width = layeredWidth
        $layered.style.width = layeredWidth + 'px'
        $layered.height = layeredHeight
        $layered.style.height = layeredHeight + 'px'
        $layeredWrap.appendChild($layered)
        $out.appendChild($layeredWrap)
        layeredCanvasCtx = $layered.getContext('2d')

        //// Create a container to visualise the sharedCache.
        $sharedCache = d.createElement('div')
        $sharedCache.innerHTML = '<h4 id="empty-cache">(The cache is empty)</h4>'
        $sharedCache.className = 'shared-cache-visualiser'
        $singleWaveformCache = d.createElement('div')
        $singleWaveformCache.className = 'single-waveform-cache'
        $sharedCache.appendChild($singleWaveformCache)
        $oscillationCache = d.createElement('div')
        $oscillationCache.className = 'oscillation-cache'
        $sharedCache.appendChild($oscillationCache)
        $gainEnvelopeCache = d.createElement('div')
        $gainEnvelopeCache.className = 'gain-envelope-cache'
        $sharedCache.appendChild($gainEnvelopeCache)
        $out.appendChild($sharedCache)

        //// Create a container to show which Seqins have been instantiated.
        $seqinInstances = d.createElement('div')
        $seqinInstances.className = 'seqin-instances'
        updateSeqinInstances()
        $out.appendChild($seqinInstances)

        //// Set up audio.
        audioCtx = new (ROOT.AudioContext||ROOT.webkitAudioContext)()

        //// By default, show the cache and directory. This may be overridden by
        //// a save-link in the query string, below.
        $('body').classList.add('show-cache', 'show-directory')

        //// Deal with a save-link in the query string.
        if (ROOT.location.search) {
            const toLoadFirst = {}
            const toLoadSecond = {}
            const toInstantiate = {}
            const toAddButton = {}
            ROOT.location.search.slice(1).split('&').forEach( parts => {
                const [ id, value ] = parts.split('=')
                parts = id.split('_')
                if (1 === parts.length) { // defines a user-preference
                    if ('hide' === parts[0]) {
                        $('body').classList.remove('show-'+value)
                        if ('directory' === value) setTimeout(resize, 100)
                    }
                } else if (2 === parts.length) { // defines an instance
                    const seqin = parts[0]
                    const family = seqin.slice(-2)
                    toLoadSecond[seqin] = 1 // eg 'r1ma'
                    toLoadFirst[family] = 1 // eg 'ma'
                    toInstantiate[id] = value // `value` is a configString
                } else {
                    toAddButton[id] = value // `value` is a configString
                }
            })
            initLoadFirst(toLoadFirst)
               .then( () => initLoadSecond(toLoadSecond) )
               .then( () => initInstantiate(toInstantiate) )
               .then( () => initAddButton(toAddButton) )
        }

        //// Deal with keypresses.
		ROOT.addEventListener('keydown', evt => {
            if (evt.ctrlKey || evt.metaKey) return // ignore browser shortcuts
            Array.from( $$('.btn') ).forEach( $button => {
                const key = $button.getAttribute('data-key')
                if (! key) return
    			if (key === evt.key) $button.click()
                if ( key === evt.key || ('enter' === evt.key && d.activeElement === $button) ) {
                    const c = $button.classList
                    if (! c.contains('pressed') ) {
                        c.add('pressed')
                        setTimeout( () => c.remove('pressed'), 200)
                    }
                    evt.preventDefault()
                }
            })
		})

        //// Deal with window size change, and make sure the current window size
        //// (eg after 'show-directory') is taken into account.
		ROOT.addEventListener('resize', resize)
        resize()

    }//init()


    //// Xx.
  , load: (familyId, seqinId) => {
        const directoryInfo = seqinId ? SEQIN.directory[familyId][seqinId] : SEQIN.directory[familyId]
        const $directoryItem = $(`#directory-${directoryInfo.META.ID}`)

        //// If the script has already been loaded, resolve immediately.
        if (SEQIN[directoryInfo.META.NAME])
            return Promise.resolve()

        //// Otherwise, resolve after the script has loaded.
        const $script = d.createElement('script')
        $script.src = directoryInfo.CDN
        if ($directoryItem) $directoryItem.className = 'loading'
        const promise = new Promise( (resolve, reject) =>
            $script.addEventListener('load', evt => {
                if ($directoryItem) $directoryItem.className = 'loaded'
                resolve()
            })
        )
        $('body').appendChild($script)
        return promise
    }


    //// Xx.
  , instantiate: (familyId, seqinId, id, config) => { // `id` and `config` are optional, used by initInstantiate()
        const directoryInfo = seqinId ? SEQIN.directory[familyId][seqinId] : SEQIN.directory[familyId]

        //// Generate an id - only needed when an instantiateButton() is clicked.
        if (null == id) {
            let tally = 0
            for (let instanceId in instances)
                if (directoryInfo.META.ID === instanceId.split('_')[0]) tally++
            id = `${directoryInfo.META.ID}_${tally}`
        }

        //// Generate configuration for perform(), and also for Seqinalysis.
        //// Again, only needed when an addButtonButton() is clicked.
        if (null == config) {
            config = {
                samplesPerBuffer: 2900
              , channelCount:     1
              , text:             id
              , attackDuration:   300
              , decayDuration:    900
              , releaseDuration:  1000
            }
        }
        config.sampleRate = audioCtx.sampleRate //@TODO allow instances to specify arbitrary sampleRate
        config.sharedCache = ROOT.sharedCache
        config.audioContext = audioCtx

        const instance = instances[id] = new SEQIN[directoryInfo.META.NAME](config)
        instance.id = id
        instance.configString = instanceConfigToString(config)
        updateSeqinInstances()

        return instance.ready // a Promise which fulfills after instance._setup() completes
    }


    //// Xx.
  , editInstance: (instanceId) => {
        let instance = instances[instanceId]
        const config = {
            samplesPerBuffer: instance.samplesPerBuffer
          , sampleRate: instance.sampleRate
          , channelCount: instance.channelCount
          , attackDuration: instance.attackDuration
          , decayDuration: instance.decayDuration
          , releaseDuration: instance.releaseDuration
          , configString: instance.configString
          , text: instance.text
          , id: instance.id
          , sharedCache: ROOT.sharedCache
          , audioContext: audioCtx
        }
        const response = prompt(`Edit config-string for ${instanceId}`, config.configString)
        if (null == response) return
        instanceStringToConfig(config, response)
        const seqinId = instanceId.split('_')[0]
        const familyId = seqinId.slice(-2)
        const directoryInfo = SEQIN.directory[familyId][seqinId]
        instance = instances[instanceId] = new SEQIN[directoryInfo.META.NAME](config)
        instance.id = instanceId
        instance.configString = instanceConfigToString(config)
        updateSeqinInstances()
        return false
    }


    //// Xx.
  , closeInstance: (instanceId) => {
        performBtns = performBtns.filter(
            performBtn => instanceId+'_' !== performBtn.id.slice(0, instanceId.length+1)
        )
        delete instances[instanceId]
        const $el = $(`#instance-${instanceId}`)
        $el.parentNode.removeChild($el)
        console.log(instances, performBtns);
        updateSeqinInstances()
        return false
    }


    //// A button generates and plays a performance, and draws its waveform.
  , addButton: (instanceId, id, config) => { // `id` and `config` are optional, used by initAddButton()

        //// Generate an id - only needed when an addButtonButton() is clicked.
        if (null == id) {
            let tally = 0
            performBtns.forEach( performBtn => {
                const idParts = performBtn.id.split('_')
                if (instanceId === `${idParts[0]}_${idParts[1]}`) tally++
            })
            id = `${instanceId}_${tally}`
        }

        //// Generate configuration for perform(), and also for Seqinalysis.
        //// Again, only needed when an addButtonButton() is clicked.
        if (null == config) {
            const colorScheme = colorSchemes[++performBtnTally % 7]
            const keypressShortcut = 26 > performBtnTally ? keypressShortcuts[performBtnTally] : null
            config = {
                id // id
              , text: id // tx
              , bufferCount: 3 // bc
              , cyclesPerBuffer: 20 // cb
              , velocity: 7 // ve
              , red: colorScheme[0] // re
              , green: colorScheme[1] // gr
              , blue: colorScheme[2] // bl
              , playKey: keypressShortcut[0] // pk, eg 'a'
              , editKey: keypressShortcut[1] // ek, eg 'A'
            }
        } else {
            performBtnTally++
        }
        config.configString = performBtnConfigToString(config)
        config.$el = d.createElement('p')

        //// Create the play-button.
        const borderColor = `rgb(${config.red||0},${config.green||0},${config.blue||0})`
        const bkgndColor  = `rgb(${~~config.red/2||0},${~~config.green/2||0},${~~config.blue/2||0})`
        const $playBtn = d.createElement('a')
        $playBtn.className = 'play btn'
        $playBtn.style.borderColor = borderColor
        $playBtn.style.backgroundColor = bkgndColor
        $playBtn.href = 'javascript:void(0)'
        if (config.playKey) $playBtn.setAttribute('data-key', config.playKey)
        $playBtn.innerHTML = config.text
//         $playBtn.innerHTML =
// `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
//     <polygon points="160,160 160,560 520,360 "/>
// </svg>`

        //// Create the edit-button.
        const $editBtn = d.createElement('a')
        $editBtn.className = 'edit btn'
        $editBtn.href = 'javascript:void(0)'
        if (config.editKey) $editBtn.setAttribute('data-key', config.editKey)
        $editBtn.innerHTML =
`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<rect x="217.628" y="197.497" transform="matrix(0.8739 0.486 -0.486 0.8739 194.4406 -117.1647)" width="211" height="237.5"/>
<path d="M328.727,89.14c8.555-15.381,28.138-20.968,43.52-12.414l128.42,71.417
	c15.382,8.554,20.968,28.137,12.413,43.519l-23.15,41.625L305.578,130.767L328.727,89.14z"/>
<path d="M190.757,582.945L340,500L160,400v166.08c0,11.046,8.954,20,20,20
	C183.959,586.08,187.65,584.93,190.757,582.945z"/>
</svg>
`

        //// Create the close-button.
        const $closeBtn = d.createElement('a')
        $closeBtn.className = 'close btn'
        $closeBtn.href = 'javascript:void(0)'
        $closeBtn.innerHTML =
`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<rect x="40" y="280" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -132.5485 320.0001)" width="560" height="80"/>
<rect x="40" y="280" transform="matrix(0.7071 0.7071 -0.7071 0.7071 320 -132.5479)" width="560" height="80"/>
</svg>
`

        //// Create the main element.
        config.$el.appendChild($playBtn)
        config.$el.appendChild($editBtn)
        config.$el.appendChild($closeBtn)

        performBtns.push(config)

        updateSeqinInstances()


        //// Deal with a play-button click.
        $playBtn.addEventListener('click', evt => {
            evt.preventDefault()

            //// Generate the performance buffers.
            instances[instanceId].perform({
                bufferCount: config.bufferCount
              , cyclesPerBuffer: config.cyclesPerBuffer
              , isLooping: false
              , events: [
                    { at:500 , down:config.velocity }
                //   , { at:14000, down:0 }
                  , { at:7000, down:0 }
                ]
              , meta: config
            }).then( buffers => {

                //// Store it.
                performances.push({ config, buffers })
                maxPerformanceSamples = Math.max( maxPerformanceSamples, instances[instanceId].samplesPerBuffer * (config.bufferCount||1) )

                //// Update the layered and sharedCache visualisers.
                updateLayeredVisualiser()
                updateSharedCacheVisualiser()

                //// Play the performance.
                buffers.forEach( (buffer, i) => {
                    const src = audioCtx.createBufferSource()
                    src.buffer = buffer.data
                    src.connect(audioCtx.destination)
                    src.start( audioCtx.currentTime + (buffer.data.length * i / audioCtx.sampleRate)) //@TODO allow instances to specifiy arbitrary sampleRate
                })

            })
            return false
        })


        //// Deal with an edit-button click.
        $editBtn.addEventListener('click', evt => {
            evt.preventDefault()
            const response = prompt(`Edit config-string for ${config.id}`, config.configString)
            if (null == response) return
            performBtnStringToConfig(config, response)
            updateSeqinInstances()
            return false
        })


        //// Deal with a close-button click.
        $closeBtn.addEventListener('click', evt => {
            evt.preventDefault()
            performBtns = performBtns.filter(
                performBtn => config.id !== performBtn.id
            )
            config.$el.parentNode.removeChild(config.$el)
            updateSeqinInstances()
            return false
        })

    }

  , save: () => {
        const query = []
        if (! $('body').classList.contains('show-cache') )
            query.push('hide=cache')
        if (! $('body').classList.contains('show-directory') )
            query.push('hide=directory')
        for (let instanceId in instances) {
            const instance = instances[instanceId]
            let configString = instance.configString
               .replace(/%/g,'%25').replace(/&/g,'%26').replace(/=/g,'%3d')
            query.push(`${instance.id}=${configString}`)
        }
        performBtns.forEach( performBtn => {
            let configString = performBtn.configString
               .replace(/%/g,'%25').replace(/&/g,'%26').replace(/=/g,'%3d')
            query.push(`${performBtn.id}=${configString}`)
        })
        let $iframe
        if (ROOT.parent)
            $iframe = ROOT.parent.document.querySelector('iframe#seqinalysis')
        if ($iframe) {
            $iframe.src = $iframe.src.split('?')[0] + '?' + query.join('&')
        } else {
            const pathParts = location.pathname.split('/')
            ROOT.location = './' + pathParts.pop() + '?' + query.join('&')
        }
    }

  , scrollTo: to => {
        scroll = to
        updateLayeredVisualiser()
    }

  , scrollBy: by => {
        scroll += by
        scroll = Math.max(scroll, 0) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , zoomTo: to => {
        const oldZoom = zoom
        zoom = 0 !== to ? to : maxPerformanceSamples / layeredWidth // zero means 'show the entire waveform'
        scroll *= (zoom / oldZoom)
        // zoom = Math.max( Math.min(zoom, 16), 0.05) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , zoomBy: by => {
        zoom *= by
        scroll *= by
        // zoom = Math.max( Math.min(zoom, 16), 0.05) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , toggleCache: () => {
        $('body').classList.toggle('show-cache')
    }

  , toggleDirectory: () => {
        $('body').classList.toggle('show-directory')
        setTimeout(resize, 100)
    }

  , clearPerformances: () => {
        performances = []
        maxPerformanceSamples = 0
        updateLayeredVisualiser()
    }

  , clearAll: () => {
        const pathParts = location.pathname.split('/')
        ROOT.location = './' + pathParts.pop()
  }


}


function updateLayeredVisualiser () {

    //// Delete the previous visualisation.
	layeredCanvasCtx.clearRect(0, 0, $layered.width, $layered.height)

    ////
    const
        xPerFrame = layeredWidth / maxPerformanceSamples * zoom

	//// Draw each performance’s buffers.
    performances.forEach( (performance,i) => {

        const
            ctx = layeredCanvasCtx
          , bufferLength = performance.buffers[0].data.length
          , red = performance.config.red, green = performance.config.green, blue = performance.config.blue
          , y = layeredHeight * 0.5 // mid-height

            //// When zoomed in, interleave each waveform’s line.
          , xOffset = (1 >= xPerFrame ? 0 : (i % performances.length) * xPerFrame / performances.length)


        //// Set fill-style for drawing the buffer margins.
        const marginFillColor = ctx.createLinearGradient(0,0, 0,layeredHeight) // x0, y0, x1, y1
        marginFillColor.addColorStop(0.0, `rgba(${red||0},${green||0},${blue||0},0.3)`)
        marginFillColor.addColorStop(0.2, `rgba(${red||0},${green||0},${blue||0},0.1)`)
        marginFillColor.addColorStop(0.8, `rgba(${red||0},${green||0},${blue||0},0.1)`)
        marginFillColor.addColorStop(1.0, `rgba(${red||0},${green||0},${blue||0},0.3)`)

    	//// Draw each buffer’s waveform.
        performance.buffers.forEach( (buffer,j) => {

            //// Step through each x position of the layered-canvas.
        	const channelBuffer = buffer.data.getChannelData(0)
            let drawnLeftEdge = false
            let x = xOffset
            for (; x<layeredWidth; x+=Math.max(xPerFrame,1) ) {
                const samplePosition = Math.floor((x + scroll) / xPerFrame) - (bufferLength * j)
                if (0 > samplePosition) continue // @TODO loops should jump straight in at first data-point
                const sampleValue = channelBuffer[samplePosition]
                if (null == sampleValue) break // reached the end of the buffer

                //// Draw the left edge of every buffer.
                if (! drawnLeftEdge) {
                    ctx.fillStyle = marginFillColor
                    ctx.fillRect(x, 0, 2, layeredHeight) // x, y, width, height
                    // ctx.moveTo(x, 0)
                    // ctx.lineTo(x, layeredHeight)
                    // ctx.stroke()
                    drawnLeftEdge = true
                }

                //// Set the waveform colour and draw the line.
                const
                    h = sampleValue * layeredHeight * -0.5
                  , fillColor = ctx.createLinearGradient(0,y, 0,y+h) // x0, y0, x1, y1
                fillColor.addColorStop(0.0, `rgba(${red||0},${green||0},${blue||0},0.2)`)
                fillColor.addColorStop(1.0, `rgba(${red||0},${green||0},${blue||0},1)`)
                ctx.fillStyle = fillColor
                ctx.fillRect(x, y, 1, h) // x, y, width, height
            }

            //// Draw the right edge of the rightmost buffer.
            ctx.fillStyle = marginFillColor
            ctx.fillRect(x, 0, 2, layeredHeight) // x, y, width, height

        })

        //// Set the styles for drawing the ADSR envelope.
        ctx.fillStyle = `rgba(${red||0},${green||0},${blue||0},0.5)`
        ctx.strokeStyle = `rgba(${red||0},${green||0},${blue||0},0.8)`
        ctx.lineJoin = 'round'
        ctx.lineWidth = 3
        ctx.beginPath()

    	//// Draw the ADSR envelope shape.
        performance.buffers.envelopeNodes.forEach( (node,j) => {
            const
                x = node.at * xPerFrame - scroll
              , y = (layeredHeight - 8) * (9 - node.level) / 9 + 4

            if (0 === j) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
                ctx.stroke()
            }
        })

    	//// Draw each ADSR node as a circle.
        ctx.beginPath()
        performance.buffers.envelopeNodes.forEach( (node,j) => {
            const
                x = node.at * xPerFrame - scroll
              , y = (layeredHeight - 8) * (9 - node.level) / 9 + 4

            ctx.moveTo(x, y)

            ctx.arc(
                x           // x position
              , y           // y position
              , 8           // radius
              , 0           // start angle
              , 2 * Math.PI // end angle (in radians)
            )
            ctx.fill()
        })
    })
}//updateLayeredVisualiser()


function updateSharedCacheVisualiser () {

    //// Remove visualised audio which is no longer in the cache.
    ////@TODO

    //// Add any new visualisations.
    for (let cacheId in ROOT.sharedCache) {
        if ( $('#'+cacheId) ) continue // a visualisation already exists
        const
            cache = ROOT.sharedCache[cacheId]
          , channelBuffer = cache.getChannelData(0)
          , $figure = d.createElement('figure')
          , $link = d.createElement('a')
          , $caption = d.createElement('caption')
          , $cacheCanvas = d.createElement('canvas')
          , xScale = 2000 > cache.length ? 1 : 2000 / cache.length

        //// HTML
        $figure.id = cacheId
        $link.className = 'btn'
        $cacheCanvas.width = cache.length * xScale
        $cacheCanvas.height = 100
        $link.appendChild($cacheCanvas)
        $figure.appendChild($link)
        $figure.appendChild($caption)
        $caption.innerHTML = cacheId

        ////
        let className
        if ( 0 < cacheId.indexOf('_SW_') ) {
            $singleWaveformCache.appendChild($figure)
            className = 'single-waveform-cache'
        } else if ( 0 < cacheId.indexOf('_OS_') ) {
            $oscillationCache.appendChild($figure)
            className = 'oscillation-cache'
        } else if ( 0 < cacheId.indexOf('_GE_') ) {
            $gainEnvelopeCache.appendChild($figure)
            className = 'gain-envelope-cache'
        } else
            throw new Error('cache has unexpected ID')

        //// Click handler.
        $link.href = 'javascript:void(0)'
        $link.addEventListener('click', evt => {
            const isShowing = $figure.classList.contains('show')
            Array.from( $$(`.${className} figure.show`) ).forEach(
                $figure => $figure.classList.remove('show') )
            if (! isShowing)
                $figure.classList.add('show')
            updateSharedCacheVisualiser()
        })

        //// Draw the cached waveform.
        const cacheCanvasCtx = $cacheCanvas.getContext('2d')
            , red = cache.meta.red, green = cache.meta.green, blue = cache.meta.blue
        for (let x=0; x<Math.min(2000,cache.length); x++) {
            const
                y = 50
              , h = channelBuffer[ Math.floor(x / xScale) ] * -50
              , fillColor = cacheCanvasCtx.createLinearGradient(0,y, 0,y+h) // x0, y0, x1, y1
            fillColor.addColorStop(0.0, `rgba(${red||0},${green||0},${blue||0},0.2)`)
            fillColor.addColorStop(1.0, `rgba(${red||0},${green||0},${blue||0},1)`)
            cacheCanvasCtx.fillStyle = fillColor
            cacheCanvasCtx.fillRect(x, y, 1, h) // x, y, width, height
        }

        if ('gain-envelope-cache' === className) {

            //// Set the styles for drawing the ADSR envelope.
            cacheCanvasCtx.fillStyle = `rgba(${red||0},${green||0},${blue||0},0.5)`
            cacheCanvasCtx.strokeStyle = `rgba(${red||0},${green||0},${blue||0},0.8)`
            cacheCanvasCtx.lineWidth = 3
            cacheCanvasCtx.lineJoin = 'round'
            cacheCanvasCtx.beginPath()

        	//// Draw the ADSR envelope shape.
            cache.reducedEnvelopeNodes.forEach( (node,j) => {
                const
                    x = node.at * xScale
                  , y = (100 - 8) * (9 - node.level) / 9 + 4

                if (0 === j) {
                    cacheCanvasCtx.moveTo(x, y)
                } else {
                    cacheCanvasCtx.lineTo(x, y)
                    cacheCanvasCtx.stroke()
                }
            })
        }

    }

    //// Set widths.
    ['single-waveform-cache', 'oscillation-cache', 'gain-envelope-cache'].forEach( className => {
        const $$canvases = Array.from( $$(`.${className} figure canvas`) )
        const $shownCanvas = $(`.${className} figure.show canvas`)
        const fullCanvasWidths = $$canvases.reduce( (sum, $canvas) => sum + $canvas.width + 12, 0 )
        const canvasWidth = $shownCanvas
          ? 10 //@TODO prevent short waveforms from sqishing down ... maybe fix `Math.max( 10, (layeredWidth - 8 - $shownCanvas.width - 12) / ($$canvases.length - 1) - 12 )`
          : (layeredWidth - 8) / $$canvases.length - 12 // `-8` makes right-margin, `-12` accounts for canvas left-margin (8px) plus two borders (2px + 2px)
        $$canvases.forEach( $canvas => {
            let w = $canvas === $shownCanvas
              ? ( layeredWidth + 2 - $$canvases.length * (canvasWidth+12) )
              : canvasWidth
            w = Math.min(w, $canvas.width)
            $canvas.style.width = w + 'px'
            $canvas.parentNode.nextSibling.style.maxWidth = (w-20) + 'px' // prevent the caption from overshooting
        })
    })

    //// Hide or show the #empty-cache message.
    $('#empty-cache').style.display = $$(`.shared-cache-visualiser figure`).length ? 'none' : 'block'
}

function updateSeqinInstances () {
    let instanceTally = 0
    for (let instanceId in instances) {
        instanceTally++
        const instance = instances[instanceId]
        let $instance = $(`#instance-${instanceId}`)
        if (! $instance) { // need to create it
            $instance = d.createElement('div')
            $instance.id = `instance-${instanceId}`
            $instance.innerHTML = `<h4><span class="btn">${instanceId}</span> ${editInstanceButton(instanceId)} ${addButtonButton(instanceId)} ${closeInstanceButton(instanceId)}</h4>`
            $seqinInstances.appendChild($instance)
        }
        let performTally = 0
        performBtns.forEach(performBtn => {
            const idParts = performBtn.id.split('_')
            if (instanceId !== `${idParts[0]}_${idParts[1]}`) return
            performTally++
            let $performBtn = $(`#performBtn-${performBtn.id}`)
            if (! $performBtn) { // need to attach it
                $performBtn = performBtn.$el
                $performBtn.id = `performBtn-${performBtn.id}`
                $instance.appendChild($performBtn)
            }
            $performBtn.className = performBtn.isReady ? 'ready' : 'not-ready'
        })
        let className =
            (instance.isReady ? 'ready' : 'not-ready')
          + (performTally ? ' has-perform-btns' : ' no-perform-btns')
        $instance.className = className
    }
    if (instanceTally) {
        if ( $('#no-instances') ) $seqinInstances.removeChild( $('#no-instances') )
    } else {
        $seqinInstances.innerHTML = '<h4 id="no-instances">(No instances)</h4>'
    }
}

function instanceStringToConfig (config, configString) {
    const keys = {
        tx: 'text'
      , cc: 'channelCount'
    //   , sr: 'sampleRate' //@TODO allow instances to specify arbitrary sampleRate
      , sb: 'samplesPerBuffer'
      , ad: 'attackDuration'
      , dd: 'decayDuration'
      , rd: 'releaseDuration'
    }
    configString.split('+').forEach( part => {
        const key = keys[ part.slice(0,2) ]
        let val = part.slice(2)
        if ( /^\d+$/.test(val) ) val = +val
        config[key] = val
    })
    config.configString = configString
}

function instanceConfigToString (config) {
    const keys = {
        text: 'tx'
      , channelCount: 'cc'
    //   , sampleRate: 'sr' //@TODO allow instances to specify arbitrary sampleRate
      , samplesPerBuffer: 'sb'
      , attackDuration: 'ad'
      , decayDuration: 'dd'
      , releaseDuration: 'rd'
    }
    let configString = []
    for (let key in keys)
        configString.push(`${keys[key]}${config[key]}`)
    return configString.join('+')
}

function performBtnStringToConfig (config, configString) {
    const keys = {
        tx: 'text'
      , bc: 'bufferCount'
      , cb: 'cyclesPerBuffer'
      , ve: 'velocity'
      , re: 'red'
      , gr: 'green'
      , bl: 'blue'
      , pk: 'playKey'
      , ek: 'editKey'
    }
    configString.split('+').forEach( part => {
        const key = keys[ part.slice(0,2) ]
        let val = part.slice(2)
        if ( /^\d+$/.test(val) ) val = +val
        config[key] = val
    })
    config.configString = configString
}

function performBtnConfigToString (config) {
    const keys = {
        text: 'tx'
      , bufferCount: 'bc'
      , cyclesPerBuffer: 'cb'
      , velocity: 've'
      , red: 're'
      , green: 'gr'
      , blue: 'bl'
      , playKey: 'pk'
      , editKey: 'ek'
    }
    let configString = []
    for (let key in keys)
        configString.push(`${keys[key]}${config[key]}`)
    return configString.join('+')
}



function initLoadFirst (toLoadFirst) {
    return new Promise( (resolve, reject) => {
        let tally = 0
        for (let familyId in toLoadFirst) tally++
        for (let familyId in toLoadFirst) {
            ROOT.SEQINALYSIS.load(familyId)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initLoadSecond (toLoadSecond) {
    return new Promise( (resolve, reject) => {
        let tally = 0
        for (let seqinId in toLoadSecond) tally++
        for (let seqinId in toLoadSecond) {
            ROOT.SEQINALYSIS.load(seqinId.slice(-2), seqinId)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initInstantiate (toInstantiate) {
    return new Promise( (resolve, reject) => {
        let tally = 0
        for (let instanceId in toInstantiate) tally++
        for (let instanceId in toInstantiate) {
            const seqinId = instanceId.split('_')[0]
            const familyId = seqinId.slice(-2)
            const config = {}
            instanceStringToConfig(config, toInstantiate[instanceId])
            config.id = instanceId
            ROOT.SEQINALYSIS.instantiate(familyId, seqinId, instanceId, config)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initAddButton (toAddButton) {
    for (let id in toAddButton) {
        const instanceId = id.split('_').slice(0,2).join('_')
        const config = {}
        performBtnStringToConfig(config, toAddButton[id])
        config.id = id
        ROOT.SEQINALYSIS.addButton(instanceId, id, config)
    }
}


function navButtons () { return `
<!--
    <a class="btn" href="javascript:void(0)" data-key="." title="To end (.)" onclick="SEQINALYSIS.scrollTo(@TODO);return !1">
      <tt>&lt;</tt>
    </a>
-->
    <a class="btn" href="javascript:SEQINALYSIS.save()" data-key="$" title="Save, by creating a link [dollar]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <path d="M78.065,363.566c-54.673,54.674-54.674,143.316,0,197.99s143.318,54.674,197.99,0l86.009-86.01
        	c0,0-26.861-1.646-52.184-7.662c-25.323-6.016-39.235-14.055-39.235-14.055l-51.16,51.158c-23.432,23.432-61.422,23.432-84.853,0
        	c-23.432-23.432-23.432-61.422-0.001-84.852l114.854-114.854c23.432-23.432,61.421-23.432,84.854,0c0,0,12.822,13.669,41.107-14.615
        	c28.707-28.708,15.461-41.954,15.461-41.954c-54.674-54.674-143.318-54.674-197.991,0L78.065,363.566z"/>
        <path d="M561.062,276.424c54.673-54.673,54.674-143.316,0-197.99s-143.317-54.674-197.99,0l-86.009,86.01
        	c0,0,26.861,1.646,52.184,7.662s39.234,14.055,39.234,14.055l51.16-51.159c23.432-23.432,61.422-23.432,84.853,0
        	c23.432,23.432,23.432,61.422,0.001,84.852L389.641,334.708c-23.432,23.432-61.421,23.432-84.854-0.001
        	c0,0-12.822-13.669-41.107,14.615c-28.707,28.708-15.461,41.954-15.461,41.954c54.674,54.674,143.318,54.674,197.99,0
        	L561.062,276.424z"/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.scrollTo(0)" data-key="," title="Jump to start [comma]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="80" y="120" width="80" height="400"/>
        <polygon points="520,120 520,520 160,320 "/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.scrollBy(window.innerWidth * -0.1)" data-key="ArrowLeft" title="Scroll left [arrow left]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <polygon points="360,120 360,520 0,320 "/>
        <rect x="320" y="280" width="320" height="80"/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.scrollBy(window.innerWidth * +0.1)" data-key="ArrowRight" title="Scroll right [arrow right]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect y="280" width="320" height="80"/>
        <polygon points="280,120 280,520 640,320 "/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.zoomBy(0.70710678118655)" data-key="ArrowDown" title="Zoom out [arrow down]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="160" y="260" width="280" height="80"/>
        <rect x="435.146" y="498.577" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 538.5785 1300.2417)" width="206.863" height="80"/>
        <path d="M300,560C156.406,560,40,443.594,40,300S156.406,40,300,40s260,116.406,260,260S443.594,560,300,560z
          M500,300c0-110.457-89.543-200-200-200s-200,89.543-200,200s89.543,200,200,200S500,410.457,500,300z"/>
      </svg>    </a>
    <a class="btn" href="javascript:SEQINALYSIS.zoomBy(1.414213562373095)" data-key="ArrowUp" title="Zoom in [arrow up]" >
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="160" y="260" width="280" height="80"/>
        <rect x="435.146" y="498.577" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 538.5785 1300.2417)" width="206.863" height="80"/>
        <rect x="260" y="160" width="80" height="280"/>
        <path d="M300,560C156.406,560,40,443.594,40,300S156.406,40,300,40s260,116.406,260,260S443.594,560,300,560z
          M500,300c0-110.457-89.543-200-200-200s-200,89.543-200,200s89.543,200,200,200S500,410.457,500,300z"/>
      </svg>
    </a>
    <!-- zoomTo(0) is treated as '1 pixel per sample-frame' -->
    <a class="btn" href="javascript:SEQINALYSIS.zoomTo(0)" data-key="1" title="1px per sample [number one]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="80" y="120" width="80" height="400"/>
        <rect x="40" y="120" width="120" height="80"/>
        <rect x="440" y="120" width="120" height="80"/>
        <rect x="480" y="120" width="80" height="400"/>
        <circle cx="312" cy="240" r="48"/>
        <circle cx="312" cy="400" r="48"/>
      </svg>
    </a>
    <!-- zoomTo(1) fits everything within window width -->
    <a class="btn" href="javascript:SEQINALYSIS.scrollTo(0);SEQINALYSIS.zoomTo(1)" data-key="0" title="Zoom to fit [number zero]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <polygon points="240,40 240,100 157.143,100 240,182.856 182.857,240 100,157.143 100,240 40,240 40,40 "/>
        <polygon points="240,600 240,540 157.143,540 240,457.144 182.857,400 100,482.857 100,400 40,400 40,600 "/>
        <polygon points="400,40 400,100 482.857,100 400,182.856 457.143,240 540,157.143 540,240 600,240 600,40 "/>
        <polygon points="400,600 400,540 482.857,540 400,457.144 457.143,400 540,482.857 540,400 600,400 600,600 "/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.toggleCache()" data-key="[" title="Show/hide cache [opening square bracket]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="80" y="80"  width="200" height="120"/>
        <rect x="320" y="80" width="160" height="120"/>
        <rect x="80" y="440" width="440" height="120"/>
        <rect x="80" y="260" width="120" height="120"/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.toggleDirectory()" data-key="]" title="Show/hide directory [closing square bracket]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <rect x="80" y="80"   width="320" height="60"/>
        <rect x="80" y="500"  width="320" height="60"/>
        <rect x="200" y="180" width="320" height="60"/>
        <rect x="200" y="380" width="320" height="60"/>
        <rect x="200" y="280" width="360" height="60"/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.clearPerformances()" data-key="\\" title="Clear performances [backslash]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <path d="M320,600C165.36,600,40,474.64,40,320S165.36,40,320,40s280,125.36,280,280S474.64,600,320,600z M550,320
        	c0-127.025-102.974-230-230-230C192.975,90,90,192.975,90,320c0,127.026,102.975,230,230,230C447.026,550,550,447.026,550,320z"/>
        <rect x="80" y="280" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 320 772.5483)" width="480" height="80"/>
      </svg>
    </a>
    <a class="btn" href="javascript:SEQINALYSIS.clearAll()" data-key="*" title="New Seqinalysis [asterisk]">
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
        <polygon points="359.999,79.999 348.661,320 359.999,560 280,560 291.34,320 280,79.999 "/>
        <polygon points="132.153,165.359 334.331,295.179 547.846,405.359 507.847,474.641 305.67,344.82 92.153,234.641 "/>
        <polygon points="92.154,405.359 305.67,295.179 507.847,165.359 547.846,234.64 334.33,344.82 132.153,474.641 "/>
      </svg>
    </a>
`
}

function loadButton (name, familyId, seqinId='') { return `
<a class="btn load" href="javascript:SEQINALYSIS.load('${familyId}','${seqinId}');void(0)" title="Load ${name}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="40" y="520" width="560" height="80"/>
    <polygon points="600,200 40,200 320,520 "/>
  </svg>
</a>`
}
function instantiateButton (name, familyId, seqinId) { return `
<a class="btn add" href="javascript:SEQINALYSIS.instantiate('${familyId}','${seqinId}');void(0)" title="Instantiate ${name}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="80" y="320" width="480" height="80"/>
    <rect x="280" y="120" width="80" height="480"/>
  </svg>
</a>`
}
function editInstanceButton (instanceId) { return `
<a class="btn edit" href="javascript:SEQINALYSIS.editInstance('${instanceId}');void(0)" title="Edit ${instanceId}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="217.628" y="197.497" transform="matrix(0.8739 0.486 -0.486 0.8739 194.4406 -117.1647)" width="211" height="237.5"/>
    <path d="M328.727,89.14c8.555-15.381,28.138-20.968,43.52-12.414l128.42,71.417
    	c15.382,8.554,20.968,28.137,12.413,43.519l-23.15,41.625L305.578,130.767L328.727,89.14z"/>
    <path d="M190.757,582.945L340,500L160,400v166.08c0,11.046,8.954,20,20,20
    	C183.959,586.08,187.65,584.93,190.757,582.945z"/>
  </svg>
</a>`
}
function closeInstanceButton (instanceId) { return `
<a class="btn close" href="javascript:SEQINALYSIS.closeInstance('${instanceId}');void(0)" title="Close ${instanceId}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="40" y="280" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -132.5485 320.0001)" width="560" height="80"/>
    <rect x="40" y="280" transform="matrix(0.7071 0.7071 -0.7071 0.7071 320 -132.5479)" width="560" height="80"/>
  </svg>
</a>`
}
function addButtonButton (instanceId) { return `
<a class="btn add" href="javascript:SEQINALYSIS.addButton('${instanceId}');void(0)" title="Add a performance-button to ${instanceId}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="60" y="280" width="520" height="80"/>
    <rect x="280" y="60" width="80" height="520"/>
  </svg>
</a>`
}



function resize () {
    layeredWidth = ROOT.innerWidth - 16 - ($('body').classList.contains('show-directory') ? 255 : 0)
    layeredHeight = 800 < ROOT.innerHeight ? 200 : 100
    $layered.width = layeredWidth
    $layered.style.width = layeredWidth + 'px'
    $layered.height = layeredHeight
    $layered.style.height = layeredHeight + 'px'
    updateLayeredVisualiser()
    updateSharedCacheVisualiser()
}

}( 'object' === typeof window ? window : global )
