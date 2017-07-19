!function (ROOT) {

ROOT.sharedCache = {}

const
    d = document
  , $ = s => d.querySelector.call(d, s)
  , $$ = s => d.querySelectorAll.call(d, s)

let instances = {}, performBtns = [], performances = []
  , $out, $nav, $layered, layeredCanvasCtx, audioCtx
  , $sharedCache, $seqinDirectory, $seqinInstances
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

        //// Create a canvas to visualise performances layered on top of each other.
        $layered = d.createElement('canvas')
        $layered.className = 'layered-visualiser'
        $layered.width = layeredWidth
        $layered.height = layeredHeight
        $out.appendChild($layered)
        layeredCanvasCtx = $layered.getContext('2d')

        //// Create a container to visualise the sharedCache.
        $sharedCache = d.createElement('div')
        $sharedCache.className = 'shared-cache-visualiser'
        $out.appendChild($sharedCache)

        //// Create a container to show what Seqins are available to load.
        $seqinDirectory = d.createElement('div')
        $seqinDirectory.className = 'seqin-directory list-wrap'
        for (let familyID in ROOT.SEQIN.directory) {
            if ('CDN' == familyID || 'META' == familyID) continue
            let family = ROOT.SEQIN.directory[familyID]
              , $family = d.createElement('div')
              , isLoaded = ROOT.SEQIN[family.META.NAME]
            $family.className = isLoaded ? 'loaded' : 'not-loaded'
            $family.id = `directory-${family.META.ID}`
            $family.innerHTML = `<h4>${family.META.NAME} ${loadButton(family.META.NAME, familyID)}</h4>`
            let seqinTally = 0
            for (let seqinID in family) {
                if ('CDN' == seqinID || 'META' == seqinID) continue
                let seqin = family[seqinID]
                  , $seqin = d.createElement('div')
                  , isLoaded = ROOT.SEQIN[seqin.META.NAME]
                $seqin.className = isLoaded ? 'loaded' : 'not-loaded'
                $seqin.id = `directory-${seqin.META.ID}`
                $seqin.innerHTML =
                  `<p>${seqin.META.NAME} ${loadButton(seqin.META.NAME, familyID, seqinID)} ${instantiateButton(seqin.META.NAME, familyID, seqinID)}</p>`
                $family.appendChild($seqin)
                seqinTally++
            }
            if (0 === seqinTally) {
                $family.innerHTML += `<p>(No Seqins in this family)</p>`
            }
            $seqinDirectory.appendChild($family)
        }
        $out.appendChild($seqinDirectory)

        //// Create a container to show which Seqins have been instantiated.
        $seqinInstances = d.createElement('div')
        $seqinInstances.className = 'seqin-instances list-wrap'
        updateSeqinInstances()
        $out.appendChild($seqinInstances)

        //// Set up audio.
        audioCtx = new (ROOT.AudioContext||ROOT.webkitAudioContext)()

        //// Deal with a save-link in the query string.
        if (ROOT.location.search) {
            const toLoadFirst = {}
            const toLoadSecond = {}
            const toInstantiate = {}
            const toAddButton = {}
            ROOT.location.search.slice(1).split('&').forEach( parts => {
                const [ id, configString ] = parts.split('=')
                parts = id.split('_')
                if (2 === parts.length) { // defines an instance
                    const seqin = parts[0]
                    const family = seqin.slice(-2)
                    toLoadSecond[seqin] = 1 // eg 'r1ma'
                    toLoadFirst[family] = 1 // eg 'ma'
                    toInstantiate[id] = configString
                } else {
                    toAddButton[id] = configString
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
                if ( key === evt.key || ('Enter' === evt.key && d.activeElement === $button) ) {
                    const c = $button.classList
                    if (! c.contains('pressed') ) {
                        c.add('pressed')
                        setTimeout( () => c.remove('pressed'), 200)
                    }
                    evt.preventDefault()
                }
            })
		})

        //// Deal with window size change.
		ROOT.addEventListener('resize', evt => {
            layeredWidth = ROOT.innerWidth - 16
            layeredHeight = 800 < ROOT.innerHeight ? 200 : 100
            $layered.width = layeredWidth
            $layered.height = layeredHeight
            updateLayeredVisualiser()
		})

    }


    //// Xx.
  , load: (familyID, seqinID) => {
        const directoryInfo = seqinID ? SEQIN.directory[familyID][seqinID] : SEQIN.directory[familyID]
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
  , instantiate: (familyID, seqinID, id, config) => { // `id` and `config` are optional, used by initInstantiate()
        const directoryInfo = seqinID ? SEQIN.directory[familyID][seqinID] : SEQIN.directory[familyID]

        //// Generate an id - only needed when an instantiateButton() is clicked.
        if (null == id) {
            let tally = 0
            for (let instanceID in instances)
                if (directoryInfo.META.ID === instanceID.split('_')[0]) tally++
            id = `${directoryInfo.META.ID}_${tally}`
        }

        //// Generate configuration for perform(), and also for Seqinalysis.
        //// Again, only needed when an addButtonButton() is clicked.
        if (null == config) {
            config = {
                samplesPerBuffer: 600
              , channelCount:     1
              , text:             id
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
  , editInstance: (instanceID) => {
        let instance = instances[instanceID]
        const config = {
            samplesPerBuffer: instance.samplesPerBuffer
          , sampleRate: instance.sampleRate
          , channelCount: instance.channelCount
          , configString: instance.configString
          , text: instance.text
          , id: instance.id
          , sharedCache: ROOT.sharedCache
          , audioContext: audioCtx
        }
        const response = prompt(`Edit config-string for ${instanceID}`, config.configString)
        if (null == response) return
        instanceStringToConfig(config, response)
        const seqinID = instanceID.split('_')[0]
        const familyID = seqinID.slice(-2)
        const directoryInfo = SEQIN.directory[familyID][seqinID]
        instance = instances[instanceID] = new SEQIN[directoryInfo.META.NAME](config)
        instance.id = instanceID
        instance.configString = instanceConfigToString(config)
        updateSeqinInstances()
        return false
    }


    //// A button generates and plays a performance, and draws its waveform.
  , addButton: (instanceID, id, config) => { // `id` and `config` are optional, used by initAddButton()

        //// Generate an id - only needed when an addButtonButton() is clicked.
        if (null == id) {
            let tally = 0
            performBtns.forEach( performBtn => {
                const idParts = performBtn.id.split('_')
                if (instanceID === `${idParts[0]}_${idParts[1]}`) tally++
            })
            id = `${instanceID}_${tally}`
        }

        //// Generate configuration for perform(), and also for Seqinalysis.
        //// Again, only needed when an addButtonButton() is clicked.
        if (null == config) {
            const colorScheme = colorSchemes[++performBtnTally % 7]
            const keypressShortcut = 26 > performBtnTally ? keypressShortcuts[performBtnTally] : null
            config = {
                id // id
              , text: id // tx
              , bufferCount: 1 // bc
              , cyclesPerBuffer: 4 // cb
              , velocity: 5 // ve
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
        const $playBtn = d.createElement('a')
        $playBtn.className = 'play btn'
        $playBtn.href = 'javascript:void(0)'
        if (config.playKey) $playBtn.setAttribute('data-key', config.playKey)
        $playBtn.innerHTML =
`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <polygon points="160,160 160,560 520,360 "/>
</svg>
`
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

        //// Create the main element.
        const color = `rgb(${config.red||0},${config.green||0},${config.blue||0})`
        config.$el.innerHTML = config.text
        config.$el.appendChild($playBtn)
        config.$el.appendChild($editBtn)
        config.$el.style.color = color

        performBtns.push(config)

        updateSeqinInstances()


        //// Deal with a play-button click.
        $playBtn.addEventListener('click', evt => {
            evt.preventDefault()

            //// Generate the performance buffers.
            instances[instanceID].perform({
                bufferCount: config.bufferCount
              , cyclesPerBuffer: config.cyclesPerBuffer
              , isLooping: false
              , events: [
                    { at:0 , down:config.velocity }
                  , { at:20, down:0 }
                ]
              , meta: config
            }).then( buffers => {

                //// Store it.
                performances.push({ config, buffers })
                maxPerformanceSamples = Math.max( maxPerformanceSamples, instances[instanceID].samplesPerBuffer * (config.bufferCount||1) )

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

    }

  , save: () => {
        const query = []
        for (let instanceID in instances) {
            const instance = instances[instanceID]
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
        // scroll = Math.max( Math.min(scroll, layeredWidth), 0) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , zoomTo: to => {
        zoom = 0 !== to ? to : maxPerformanceSamples / layeredWidth // zero means 'show the entire waveform'
        // zoom = Math.max( Math.min(zoom, 16), 0.05) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , zoomBy: by => {
        zoom *= by
        // zoom = Math.max( Math.min(zoom, 16), 0.05) // clamp @TODO fix this
        updateLayeredVisualiser()
    }

  , clearPerformances: () => {
        performances = []
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

	//// Draw each performance’s buffers.
    performances.forEach( (performance,i) => {

    	//// Draw each buffer’s waveform.
        performance.buffers.forEach( (buffer,j) => {

            //// Draw a filled shape.
            const
        	    channelBuffer = buffer.data.getChannelData(0)
              , xPerFrame = layeredWidth / maxPerformanceSamples * zoom

                //// When zoomed in, interleave each waveform’s line.
              , xOffset = (1 >= xPerFrame ? 0 : (i % performances.length) * xPerFrame / performances.length)

                //// Set the waveform colour.
              , fillColor = layeredCanvasCtx.createLinearGradient(0,0, 0,layeredHeight)
              , red = performance.config.red, green = performance.config.green, blue = performance.config.blue

            ////
            const outerAlpha = (j % 2) ? 0.2 : 1
            const innerAlpha = (j % 2) ? 1 : 0.2
            fillColor.addColorStop(0.0, `rgba(${red||0},${green||0},${blue||0},${outerAlpha})`)
            fillColor.addColorStop(0.5, `rgba(${red||0},${green||0},${blue||0},${innerAlpha})`)
            fillColor.addColorStop(1.0, `rgba(${red||0},${green||0},${blue||0},${outerAlpha})`)
            layeredCanvasCtx.fillStyle = fillColor

            //// Step through each x position of the layered-canvas.
            let draws = 0
            for ( let x=xOffset; x<layeredWidth; x+=Math.max(xPerFrame,1) ) {
                const sampleValue = channelBuffer[ Math.floor((x + scroll) / xPerFrame) - (channelBuffer.length * j) ]
                if (null == sampleValue) continue // no data-point here @TODO loops should jump straight in at first data-point, and then `break` when hitting the end
                layeredCanvasCtx.fillRect(
                    x                                // x position
                  , layeredHeight * 0.5                         // y position
                  , 1                                           // width
                  , sampleValue * layeredHeight * -0.5 // height
                )
                draws++
            }
        })
    })
}


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

        //// HTML
        $figure.id = cacheId
        $link.className = 'btn'
        $link.href = 'javascript:void(0)'
        $link.addEventListener('click', evt => {
             const isShowing = $figure.classList.contains('show')
             Array.from( $$('.shared-cache-visualiser figure.show') ).forEach(
                 $figure => $figure.classList.remove('show') )
             if (! isShowing) $figure.classList.add('show')
        })
        $cacheCanvas.width = cache.length
        $cacheCanvas.height = 100
        $link.appendChild($cacheCanvas)
        $figure.appendChild($link)
        $figure.appendChild($caption)
        $caption.innerHTML = cacheId
        $sharedCache.appendChild($figure)

        //// Draw the cached waveform.
        const
            cacheCanvasCtx = $cacheCanvas.getContext('2d')
          , fillColor = cacheCanvasCtx.createLinearGradient(0,0, 0,100)
          , red = cache.meta.red, green = cache.meta.green, blue = cache.meta.blue
        fillColor.addColorStop(0.0, `rgba(${red||0},${green||0},${blue||0},1)`)
        fillColor.addColorStop(0.5, `rgba(${red||0},${green||0},${blue||0},0.3)`)
        fillColor.addColorStop(1.0, `rgba(${red||0},${green||0},${blue||0},1)`)
        cacheCanvasCtx.fillStyle = fillColor
        for (let frame=0; frame<cache.length; frame++) {
            cacheCanvasCtx.fillRect(frame,50, 1,channelBuffer[frame] * -50) // x,y,w,h
        }
    }
}

function updateSeqinInstances () {
    let instanceTally = 0
    for (let instanceID in instances) {
        instanceTally++
        const instance = instances[instanceID]
        let $instance = $(`#instance-${instanceID}`)
        if (! $instance) { // need to create it
            $instance = d.createElement('div')
            $instance.id = `instance-${instanceID}`
            $instance.innerHTML = `<h4>${instanceID} ${addButtonButton(instanceID)} ${editInstanceButton(instanceID)}</h4>`
            $seqinInstances.appendChild($instance)
        }
        let performTally = 0
        performBtns.forEach(performBtn => {
            const idParts = performBtn.id.split('_')
            if (instanceID !== `${idParts[0]}_${idParts[1]}`) return
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
        $seqinInstances.innerHTML = '<h4 id="no-instances">(No instances)<h4>'
    }
}

function instanceStringToConfig (config, configString) {
    const keys = {
        tx: 'text'
      , cc: 'channelCount'
    //   , sr: 'sampleRate' //@TODO allow instances to specify arbitrary sampleRate
      , sb: 'samplesPerBuffer'
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
        for (let familyID in toLoadFirst) tally++
        for (let familyID in toLoadFirst) {
            ROOT.SEQINALYSIS.load(familyID)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initLoadSecond (toLoadSecond) {
    return new Promise( (resolve, reject) => {
        let tally = 0
        for (let seqinID in toLoadSecond) tally++
        for (let seqinID in toLoadSecond) {
            ROOT.SEQINALYSIS.load(seqinID.slice(-2), seqinID)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initInstantiate (toInstantiate) {
    return new Promise( (resolve, reject) => {
        let tally = 0
        for (let instanceID in toInstantiate) tally++
        for (let instanceID in toInstantiate) {
            const seqinID = instanceID.split('_')[0]
            const familyID = seqinID.slice(-2)
            const config = {}
            instanceStringToConfig(config, toInstantiate[instanceID])
            config.id = instanceID
            ROOT.SEQINALYSIS.instantiate(familyID, seqinID, instanceID, config)
               .then( () => {if (! --tally) resolve()} ) // resolve when all scripts have loaded
        }
    })
}
function initAddButton (toAddButton) {
    for (let id in toAddButton) {
        const instanceID = id.split('_').slice(0,2).join('_')
        const config = {}
        performBtnStringToConfig(config, toAddButton[id])
        config.id = id
        ROOT.SEQINALYSIS.addButton(instanceID, id, config)
    }
}


function navButtons () { return `
<!--
    <a class="btn" href="javascript:void(0)" data-key="." title="To end (.)" onclick="SEQINALYSIS.scrollTo(@TODO);return !1">
      <tt>&lt;</tt>
    </a>
-->
    <a class="btn" href="javascript:SEQINALYSIS.save()" data-key="$" title="Save, by creating a link [dollar $]">
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
    <a class="btn" href="javascript:SEQINALYSIS.clearPerformances()" data-key="\\" title="Clear Performances [backslash]">
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

function loadButton (name, familyID, seqinID='') { return `
<a class="btn load" href="javascript:SEQINALYSIS.load('${familyID}','${seqinID}');void(0)" title="Load ${name}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="40" y="520" width="560" height="80"/>
    <polygon points="600,200 40,200 320,520 "/>
  </svg>
</a>`
}
function instantiateButton (name, familyID, seqinID) { return `
<a class="btn add" href="javascript:SEQINALYSIS.instantiate('${familyID}','${seqinID}');void(0)" title="Instantiate ${name}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="80" y="320" width="480" height="80"/>
    <rect x="280" y="120" width="80" height="480"/>
  </svg>
</a>`
}
function editInstanceButton (instanceID) { return `
<a class="btn edit" href="javascript:SEQINALYSIS.editInstance('${instanceID}');void(0)" title="Edit ${instanceID}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="217.628" y="197.497" transform="matrix(0.8739 0.486 -0.486 0.8739 194.4406 -117.1647)" width="211" height="237.5"/>
    <path d="M328.727,89.14c8.555-15.381,28.138-20.968,43.52-12.414l128.42,71.417
    	c15.382,8.554,20.968,28.137,12.413,43.519l-23.15,41.625L305.578,130.767L328.727,89.14z"/>
    <path d="M190.757,582.945L340,500L160,400v166.08c0,11.046,8.954,20,20,20
    	C183.959,586.08,187.65,584.93,190.757,582.945z"/>
  </svg>
</a>`
}
function addButtonButton (instanceID) { return `
<a class="btn add" href="javascript:SEQINALYSIS.addButton('${instanceID}');void(0)" title="Add ${instanceID}">
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect x="80" y="320" width="480" height="80"/>
    <rect x="280" y="120" width="80" height="480"/>
  </svg>
</a>`
}


}( 'object' === typeof window ? window : global )
