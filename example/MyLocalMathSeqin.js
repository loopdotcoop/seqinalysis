!function (ROOT) { 'use strict'


//// Standard metadata about this Seqin.
const META = {
    NAME:    { value:'MyLocalMathSeqin' }
  , ID:      { value:'myma'           }
  , VERSION: { value:'0.0.2'          }
  , SPEC:    { value:'20170705'       }
  , HELP:    { value:
`Example of how to specify a locally-hosted Seqin - great for development!` }
}


//// Check that the environment is set up as expected.
const SEQIN = ROOT.SEQIN // available on the window (browser) or global (Node.js)
if (! SEQIN)           throw new Error('The SEQIN global object does not exist')
if (! SEQIN.Seqin)     throw new Error('The base SEQIN.Seqin class does not exist')
if (! SEQIN.MathSeqin) throw new Error('The base SEQIN.MathSeqin class does not exist')


//// Define the main class.
SEQIN.MyLocalMathSeqin = class extends SEQIN.MathSeqin {

    constructor (config) {
        super(config)
    }


    //// Returns a new single-waveform buffer, filled with sample-values.
    //// For MyLocalMathSeqin, we create a nasty sounding ‘tangent’ waveform.
    //// Called by: perform() > _buildBuffers() > _getSingleWaveformBuffer()
    _renderSingleWaveformBuffer (config) {
        const samplesPerCycle = this.samplesPerBuffer / config.cyclesPerBuffer
        const f = Math.PI * 2 / samplesPerCycle // frequency
        const singleWaveformBuffer = this.audioContext.createBuffer(
                this.channelCount // numOfChannels
              , samplesPerCycle   // length
              , this.sampleRate   // sampleRate
            )
        for (let channel=0; channel<this.channelCount; channel++) {
            const singleWaveformChannel = singleWaveformBuffer.getChannelData(channel)
            for (let i=0; i<samplesPerCycle; i++)
                singleWaveformChannel[i] = Math.tan(i * f)
        }
        return Promise.resolve(singleWaveformBuffer)
    }

} // MyLocalMathSeqin


//// Add static constants to the main class.
Object.defineProperties(SEQIN.MyLocalMathSeqin, META)


}( 'object' === typeof window ? window : global )
