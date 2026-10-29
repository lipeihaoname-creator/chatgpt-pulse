import test from 'node:test';
import assert from 'node:assert/strict';
import {bubbleTop} from '../src/lib/bubble-anchor.js';
test('bubble anchor centers compact rows and bounds tall dialogue at the top edge',()=>{for(const height of [54,76,88,100,112])assert.equal(bubbleTop(height)+height/2,64);assert.equal(bubbleTop(50,11)+11+25,64);assert.equal(bubbleTop(140),8);assert.equal(bubbleTop(NaN),64);});
