
import { GoogleGenAI, Modality } from "@google/genai";
import { decodeBase64, decodeAudioData } from './AudioUtils';

/**
 * Generates speech using the Gemini 2.5 Flash TTS model.
 * Returns a decoded AudioBuffer.
 */
export async function generateGeminiSpeech(
  text: string,
  voiceName: string,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ 
          // Prompt is simplified to ensure the model focuses on the provided text's native language
          text: `Read this text clearly and naturally in its intended language: ${text}` 
        }] 
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini API.");
    }

    const audioBytes = decodeBase64(base64Audio);
    // Gemini TTS returns 24kHz raw PCM
    return await decodeAudioData(audioBytes, audioContext, 24000, 1);
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
}
