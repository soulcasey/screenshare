const socket = io();
const video = document.getElementById("video");

let peerConnections = {};
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

socket.on("error", (message) => {
	alert(message);
});

// Broadcaster shares screen and sends offer
async function startBroadcast() {
	const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

	const isPublic = document.getElementById("is-public").checked;
	socket.emit("broadcaster", isPublic);

	socket.once("roomCreated", (code) => 
	{
		console.log("enter");
		video.srcObject = stream;

		socket.on("watcher", (id) => {
			const peerConnection = new RTCPeerConnection(config);
			peerConnections[id] = peerConnection;

			stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

			peerConnection.onicecandidate = event => {
				if (event.candidate) {
					socket.emit("candidate", id, event.candidate);
				}
			};

			peerConnection.createOffer()
			.then(sdp => peerConnection.setLocalDescription(sdp))
			.then(() => {
				socket.emit("offer", id, peerConnection.localDescription);
			});
		});

		socket.on("answer", (id, description) => {
			peerConnections[id].setRemoteDescription(description);
		});

		socket.on("candidate", (id, candidate) => {
			peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
		});

		socket.on("disconnectPeer", id => {
			if (peerConnections[id]) {
				peerConnections[id].close();
				delete peerConnections[id];
			}
		});

			hideControlsAndShowVideo(code);
		})
  }

  // Watcher connects and waits for offer
function joinStream() {
	const code = document.getElementById("watch-code").value;
	socket.emit("watcher", code);

	socket.once("roomJoined", (code) => {
		viewStream(code)
	});
}

function joinRandom() {
	socket.emit("joinRandom");

	socket.once("roomJoined", (code) => {
		viewStream(code)
	});
}

function viewStream(code) {
	const peerConnection = new RTCPeerConnection(config);

	peerConnection.ontrack = event => {
		video.srcObject = event.streams[0];
	};

	peerConnection.onicecandidate = event => {
		if (event.candidate) {
			socket.emit("candidate", broadcasterId, event.candidate);
		}
	};

	let broadcasterId;

	socket.on("offer", async (id, description) => {
		broadcasterId = id;
		await peerConnection.setRemoteDescription(description);
		const answer = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answer);
		socket.emit("answer", id, peerConnection.localDescription);
	});

	socket.on("candidate", (id, candidate) => {
		peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
	});

	hideControlsAndShowVideo(code);
}

function hideControlsAndShowVideo(code) {
	document.getElementById('title').style.display = 'none';
    document.getElementById('controls').style.display = 'none';

	document.getElementById('video-container').style.display = 'flex';
	document.getElementById('video').style.display = 'block';
	document.getElementById('room-code-display').textContent = `${code}`;
}

document.getElementById('room-code-display').addEventListener('click', () => {
  const displayEl = document.getElementById('room-code-display');
  const text = displayEl.textContent.replace('Broadcast Code: ', '').trim();

  // Disable click temporarily
  displayEl.style.pointerEvents = 'none';

  navigator.clipboard.writeText(text).then(() => {
    const originalText = displayEl.textContent;
    displayEl.textContent = 'Copied!';

    setTimeout(() => {
      displayEl.textContent = originalText;
      displayEl.style.pointerEvents = 'auto'; // Re-enable click
    }, 1000);
  });
});