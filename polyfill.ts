import process from 'process';
import { Buffer } from 'buffer';

global.process = process;
global.Buffer = Buffer;

// Ξεγελάμε το σύστημα λέγοντας ότι τρέχει Node v18
if (!(global.process as any).versions) {
  (global.process as any).versions = { node: '18.0.0' };
}

// ---> Η ΝΕΑ ΓΡΑΜΜΗ ΠΟΥ ΛΥΝΕΙ ΤΟ 'split' ERROR <---
if (!(global.process as any).version) {
  (global.process as any).version = 'v18.0.0';
}