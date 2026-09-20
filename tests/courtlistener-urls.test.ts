import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courtListenerAudioSource,
  courtListenerFileUrl,
  courtListenerStorageUrl,
} from "../src/shared/courtlistener-urls.js";

test("CourtListener storage paths become secure browser-playable URLs", () => {
  assert.equal(
    courtListenerStorageUrl("mp3/2026/09/16/in_re_us_cl.mp3"),
    "https://storage.courtlistener.com/mp3/2026/09/16/in_re_us_cl.mp3",
  );
  assert.equal(courtListenerStorageUrl("../private/file.mp3"), null);
  assert.equal(courtListenerStorageUrl("https://example.com/audio.mp3"), null);
});

test("CourtListener audio prefers its HTTPS copy over an insecure court URL", () => {
  const source = courtListenerAudioSource({
    local_path_mp3: "mp3/2026/09/16/in_re_us_cl.mp3",
    download_url: "http://court.example/audio.mp3",
  });
  assert.equal(source.streamUrl, "https://storage.courtlistener.com/mp3/2026/09/16/in_re_us_cl.mp3");
  assert.equal(source.originalUrl, "http://court.example/audio.mp3");
  assert.equal(source.isCourtListenerCopy, true);
});

test("public file links remain limited to CourtListener HTTPS hosts", () => {
  assert.equal(
    courtListenerFileUrl("https://storage.courtlistener.com/report.pdf"),
    "https://storage.courtlistener.com/report.pdf",
  );
  assert.equal(courtListenerFileUrl("http://storage.courtlistener.com/report.pdf"), null);
  assert.equal(courtListenerFileUrl("https://example.com/report.pdf"), null);
});
