import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";

export default function TelaConfiguracoes({
  filiais,
  filiaisAtivas,
  centros,
  grupos = [],
  visoesContabeis,
  onAbrir,
}) {
  const cartoes = [
    {
      id: "filiais",
      titulo: "Filiais",
      icone: "building",
      legenda: `${filiaisAtivas.length} de ${filiais.length} em uso`,
      origem: "dbo.FILIAIS",
    },
    {
      id: "centros",
      titulo: "Centro de Custos",
      icone: "layers",
      legenda: `${centros.length} ${centros.length === 1 ? "centro ativo" : "centros ativos"}`,
      origem: "dbo.CTB_CENTRO_CUSTO",
    },
    // Único cartão que leva a algo que o portal DECIDE, não a um cadastro lido
    // do ERP. Por isso a origem nomeia o uso e não uma tabela do Linx.
    {
      id: "grupos",
      titulo: "Grupos de centro de custo",
      icone: "folder",
      legenda: grupos.length
        ? `${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`
        : "nenhum grupo ainda",
      origem: "recorte para ler o DRE",
    },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="Configurações"
        subtitulo="Cadastros lidos do ERP. Valem para todos os planos orçamentários."
      />

      <div className="grid-modulos grid-modulos--config">
        {cartoes.map((cartao) => (
          <button
            type="button"
            className="card-modulo card-modulo--config"
            key={cartao.id}
            onClick={() => onAbrir(cartao.id)}
          >
            <span className="card-modulo__icone">
              <Icone nome={cartao.icone} tamanho={23} />
            </span>
            <span className="card-modulo__texto">
              <strong>{cartao.titulo}</strong>
              <small>
                {cartao.legenda} · {cartao.origem}
              </small>
            </span>
            <Icone nome="chevron" tamanho={17} />
          </button>
        ))}
      </div>

      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        As listas são do ERP e não se editam aqui — o que o portal decide é quais filiais usar. O
        plano de contas vem das {visoesContabeis.length} visões contábeis do Linx, escolhidas em
        cada visão do portal.
      </p>
    </main>
  );
}
