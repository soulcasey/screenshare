const socket = io();
const video = document.getElementById("video");
const codeInputField = document.getElementById('watch-code');
const joinButton = document.getElementById('join-button');

let peerConnections = {};
const config = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
	iceTransportPolicy: "all"
};

let roomCode = "";

// block video pause
document.querySelector('video').addEventListener('click', (e) => e.preventDefault() )

// Broadcast mode
async function startBroadcast() {
	const stream = await navigator.mediaDevices.getDisplayMedia({
		video: {
			frameRate: 15,
			width: { max: 1280 },
			height: { max: 720 }
		}
	});

	const isPublic = document.getElementById("is-public").checked;
	socket.emit("broadcaster", isPublic);

	socket.once("roomCreated", (code) => {
		video.srcObject = stream;
		updateWatchCount(0);

		socket.on("newWatcher", (id, count) => {
			const peerConnection = new RTCPeerConnection(config);
			peerConnections[id] = peerConnection;
			updateWatchCount(count);

			stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

			peerConnection.onicecandidate = event => {
				if (event.candidate) socket.emit("candidate", id, event.candidate);
			};

			// Optional bandwidth control
			peerConnection.addEventListener('negotiationneeded', async () => {
				const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
				const params = sender.getParameters();
				if (!params.encodings) params.encodings = [{}];
				params.encodings[0].maxBitrate = 500_000;
				await sender.setParameters(params);
			});

			peerConnection.createOffer()
				.then(sdp => peerConnection.setLocalDescription(sdp))
				.then(() => socket.emit("offer", id, peerConnection.localDescription));
		});

		socket.on("answer", (id, description) => {
			peerConnections[id].setRemoteDescription(description);
		});

		socket.on("candidate", (id, candidate) => {
			peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
		});

		socket.on("disconnectWatcher", (id, count) => {
			if (peerConnections[id]) {
				peerConnections[id].close();
				delete peerConnections[id];
			}
			
			updateWatchCount(count);
		});

		hideControlsAndShowVideo(code);
	});
}

// Watcher mode
function joinStream() {
	const code = codeInputField.value;
	if (code.length !== 6) return;
	socket.emit("watcher", code);

	socket.once("roomJoined", (code) => {
		viewStream(code);
	});
}

function joinRandom() {
	socket.emit("joinRandom");

	socket.once("roomJoined", (code) => {
		viewStream(code);
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

	socket.on("newWatcher", (id, count) => {
		updateWatchCount(count);
	});

	socket.on("disconnectWatcher", (id, count) => {
		updateWatchCount(count);
	});

	hideControlsAndShowVideo(code);
}

function hideControlsAndShowVideo(code) {
	document.getElementById('title').style.display = 'none';
	document.getElementById('controls').style.display = 'none';

	document.getElementById('video-container').style.display = 'flex';
	document.getElementById('video').style.display = 'block';
	document.getElementById('room-code-display').textContent = `${code}`;
	roomCode = code;
}

function copyCode() {
	const displayEl = document.getElementById('room-code-display');
	const text = displayEl.textContent.trim();

	displayEl.style.pointerEvents = 'none';
	navigator.clipboard.writeText(text).then(() => {
		displayEl.textContent = 'Copied!';
		setTimeout(() => {
			displayEl.textContent = roomCode;
			displayEl.style.pointerEvents = 'auto';
		}, 1000);
	});
}

function updateWatchCount(count) {
	document.getElementById('watch-count').textContent = `${count}`;
}

// Enable Join Button Only If Code is 6 Digits
codeInputField.addEventListener('input', () => {
	joinButton.disabled = codeInputField.value.length !== 6;
});

socket.on("error", (message) => {
	alert(message);
});